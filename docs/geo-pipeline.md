# Geographic pipeline

Everything the 3D world and the map draw comes from one pinned OpenStreetMap
snapshot, processed locally by the scripts in `scripts/`. No Overpass server, no
public tile endpoint, and no third-party map SDK is involved at runtime or at
build time.

## 1. Source data

| Field | Value |
| --- | --- |
| Source | Geofabrik regional extract — <https://download.geofabrik.de/africa/nigeria.html> |
| File | `nigeria-261015.osm.pbf` (`data/raw/`, gitignored) |
| Bytes | 710 882 130 |
| SHA-256 | `14f14d5914df757ec76bd79f703df87557b2a74c9c2e4eef3d58e7281cfaf363` |
| Snapshot | 2026-10-15T20:21:00Z |
| Licence | ODbL-1.0 (OpenStreetMap Foundation) |
| Attribution | © OpenStreetMap contributors |

The national extract is **never shipped**. It is downloaded, verified, clipped,
and the clipped products (`public/data`, `public/map`) are what the site serves.

## 2. Extraction bounds

```
west 3.39366   south 6.45166   east 3.40180   north 6.45976      (EPSG:4326)
```

This is a **provisional 906 × 907 m extraction rectangle** on the north-west of
Lagos Island — the Glover / Oshodi / Adeniji Adele / Tokunbo grid — with a
**561 × 565 m playable core** inside it. It is **not** an official neighbourhood
boundary.

The previous build used a 10.0 × 9.9 km Victoria Island / Ikoyi rectangle. That
was ~122× larger in area, and it produced exactly the failures the compact
version fixes: roads scattered across kilometres, a map that could not show the
neighbourhood at a useful zoom, and a car that felt toy-sized against the
world. The playable rectangle is now small enough to drive across in under a
minute and dense enough that 104 curated ways read as streets rather than
fragments.

## 3. Tools

| Tool | Version | Role |
| --- | --- | --- |
| Node.js | 20+ (used: 24.16) | all extraction scripts, tests |
| Planetiler | v0.10.2 (pinned jar, SHA-256 checked into `tools/planetiler.jar.sha256`) | PMTiles vector-tile build |
| Java | 21+ | Planetiler runtime |
| `osm-pbf-parser` | 2.3.0 | streaming pass over the PBF for the world data |
| `pmtiles` / `@mapbox/vector-tile` / `pbf` | 4.5.0 / 3.0.0 / 5.1.2 | reading the tile archive back for water polygons |
| MapLibre GL JS | 6.14.0 | map renderer (renders our archive; it is not a data source) |

GDAL/osmium/GeoPandas were evaluated for the clipping step and not needed: the
tile stage clips with Planetiler's `--bounds`, and the world-data stage is a
single streaming pass over the PBF that keeps only in-bounds entities, so no
intermediate shapefile stack is required. The background archives Planetiler
uses (OSMData water polygons, lake centrelines, Natural Earth) are public-domain
downloads pinned in `scripts/download-sources.mjs`.

## 4. Reproducing

```bash
pnpm install

node scripts/download-osm.mjs       # Nigeria PBF (~711 MiB) + md5 verification
node scripts/download-sources.mjs   # Planetiler jar + public-domain background data

node scripts/build-tiles.mjs        # → public/map/lagos.pmtiles  (PMTiles v3, OSM max zoom 15)
node scripts/extract-water-from-tiles.mjs
node scripts/extract-world-data.mjs # → public/data/lagos-world.json, lagos-graph.json, chunks, provenance

pnpm test                           # extraction invariants + physics + graph + routing
```

`pnpm run geo:all` runs the same sequence end to end. Each stage re-checks its
inputs (file size, MD5/SHA-256, tool presence) and fails loudly rather than
producing a partial world.

### Why water comes from the tiles, not the PBF

The Lagos Lagoon and the Atlantic are mapped as multipolygons that extend well
beyond the rectangle, so a bounds-limited PBF pass cannot stitch their rings.
Planetiler reads the whole national extract and clips correctly, so the `water`
layer of the archive is the accurate, already-clipped source — and using it
guarantees the 3D water polygons are the same shape the map draws.

## 5. What is extracted

Recorded in `public/data/lagos-provenance.json` (generated, not hand-written):

| Layer | Count |
| --- | --- |
| OSM entities scanned | 156 443 457 |
| Nodes in bounds | 4 589 |
| Road ways (before curation) | 142 |
| Road ways (drivable, shipped) | 104 |
| Drivable length | 15.73 km |
| Buildings | 900 |
| — height from `height` tag | 0 |
| — height from `building:levels` | 414 |
| — estimated height (54 %) | 486 |
| Water polygons | 2 |
| Green / park polygons | 0 |
| POIs | 3 |
| Street trees (generated from OSM nodes) | 725 |
| Street lights (surveyed) | 25 |
| Traffic signals | 0 |
| Pedestrian crossings | 2 |
| Road-graph nodes / edges | 173 / 225 |
| Connected components | 1 |
| Portfolio stations | 9 |

### Road curation

`scripts/lib/curate-roads.mjs` turns the raw extract into a drivable network
before the graph and render meshes are built:

1. drop non-car classes (footways, paths, steps, cycleways, tracks);
2. enforce a 6 m minimum carriageway width;
3. iteratively prune dangling chains shorter than 45 m and isolated fragments
   shorter than 12 m;
4. keep only ways that resolve into the largest connected component, then prune
   again — removing a fragment can expose a new stub;
5. protect every way within 30 m of a portfolio station, so curation can never
   orphan a destination.

This removed 38 of 142 ways (6 non-car ways, 11 stubs, 10 fragments and 11 ways
outside the main component) while keeping 15.73 km of real surveyed geometry.
No road was invented or straightened; intersections remain where OSM maps them.
The stats are written to `public/data/lagos-provenance.json` under `curation`,
and `node scripts/validate-world.mjs` re-checks the shipped result.

### Data quality rules

- Buildings crossing the rectangle are **skipped**, never clipped silently.
- Multipolygon **inner rings (courtyards) are dropped**; outer rings only.
- Turn restrictions with a way as `via` member are skipped and counted.
- Missing heights are estimated deterministically (hash of the OSM id), so
  geometry is stable between runs. This is an **estimate, not measured data**,
  and the provenance file says so.
- Street trees and lights are **generated along road centrelines**, not read
  from OSM (OSM maps one tree and 25 lamps here). Street furniture (benches,
  bins, planters, signs) is generated too. The provenance file lists this.
- A station anchor more than 60 m from the nearest drivable edge fails the
  build, so a typo cannot silently place a destination in the lagoon.
- `ALLOW_FAR_STATIONS=1` relaxes that check for experiments; it is unset for
  every shipped build.

## 6. Outputs

| Output | Size | Consumer |
| --- | --- | --- |
| `public/map/lagos.pmtiles` | 0.5 MiB | MapLibre GL JS, byte-range requests |
| `public/map/fonts/*` | — | offline glyph PBFs (Noto Sans, OFL-1.1) |
| `public/data/lagos-world.json` | 40 KiB | 3D scene: roads, water, green, props, stations |
| `public/data/lagos-graph.json` | 48 KiB | route graph for the autopilot |
| `public/data/lagos-buildings-<row><col>.json` | 60 KiB total | 9 chunks, 3×3, loaded in parallel |
| `public/data/lagos-water.json` | 3 KiB | lagoon/Atlantic polygons for the 3D water plane |
| `public/data/lagos-provenance.json` | — | snapshot, licence, CRS, counts, curation, quality, routes |

## 7. Hosting

The archive is PMTiles v3 and needs **HTTP range requests** plus long-lived
caching. `pnpm start` (Next's static file handler) serves both; the deployed
target must do the same. On hosts that cannot range-serve the archive, the fallback is
to pre-split it into per-zoom files and serve them as ordinary static assets —
an archive this size (0.5 MiB) is well within free-tier bandwidth for a
portfolio, but the requirement should still be verified on the actual host
before publishing.
