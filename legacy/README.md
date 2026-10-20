# Soburr — a drivable Lagos portfolio

An interactive portfolio for **Abdul Sobur**: the 3D world is a real
neighbourhood built from OpenStreetMap data — the **north-west Lagos Island grid
around Glover, Oshodi and Adeniji Adele** — with real streets, real building
footprints, a drivable car, a road-following autopilot, and a genuine geographic
map rendered from our own vector-tile archive. The world is deliberately compact:
a 561 × 565 m playable core inside a 906 m extraction rectangle, not a district
scaled down.

Everything runs on free and open tooling. No paid API, no proprietary map SDK,
no public tile server, no third-party 3D asset library.

```
pnpm install
pnpm dev            # http://localhost:3000
```

## What is actually real

| Real | Generated (and labelled as such) |
| --- | --- |
| Road centrelines, classes, names, one-way tags, bridges | Building heights for the 54 % of footprints with no height/level tag (deterministic estimates) |
| Building footprints (900 of them) | Facade/roof materials and window patterns |
| Water polygons and waterway centrelines | Street trees, street lights and street furniture (placed along road centrelines; OSM maps only one tree and 25 lamps here) |
| 104 drivable ways curated into one connected network | The nine project "stations" — fictional landmark placements anchored to real streets, never presented as local landmarks |

## Stack

- **Next.js 16.4** (App Router, Turbopack) + **React 19.3**
- **three 0.183** + **@react-three/fiber 9.8** for the world
- **MapLibre GL JS 6.14** + **PMTiles 4.5** for the map
- **pnpm** as the package manager; Node **24** for the extraction scripts

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | dev server (copies the MapLibre worker into `public/` first) |
| `pnpm build` / `pnpm start` | production build / serve |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm test` | 41 tests over projection, graph, physics, autopilot and the shipped data |
| `pnpm run geo:all` | full geographic pipeline (see below) |

## Geographic pipeline

The world and the map are generated from one pinned Geofabrik Nigeria extract
(2026-10-15, SHA-256 verified, ODbL). The 711 MiB national PBF is processed
locally and never shipped; only the clipped products are (≈0.7 MiB in total,
including the PMTiles archive).

```bash
node scripts/download-osm.mjs        # Nigeria PBF + md5 verification
node scripts/download-sources.mjs    # Planetiler jar + public-domain background data
node scripts/build-tiles.mjs         # → public/map/lagos.pmtiles (PMTiles v3, OSM max zoom 15)
node scripts/extract-water-from-tiles.mjs
node scripts/extract-world-data.mjs  # → public/data/* (world, graph, 3 × 3 building chunks, provenance)
pnpm test
```

Full detail — bounds, tool versions, counts, quality rules, outputs, hosting
requirements — is in [docs/geo-pipeline.md](docs/geo-pipeline.md). The
geographic-to-world transform, the physics, the routing and the map/world
alignment are documented in [docs/architecture.md](docs/architecture.md).

## Coordinates

One documented transform, shared by the extraction script, the 3D scene, the
physics, the autopilot, the map and the tests:

```
world = Web Mercator metres, origin at the centre of the extraction bounds
+X = east   +Z = north   +Y = up       (WGS84 / EPSG:4326 in, metres out)
```

Mercator metres are a uniform 0.64 % longer than ground metres at 6.456°N, and
vary by < 0.1 m across the 0.9 km north–south extent of the rectangle. Using
Mercator keeps the 3D geometry pixel-aligned with the MapLibre basemap, which is
what map/world alignment requires. See
[docs/architecture.md](docs/architecture.md#coordinate-system).

## Driving

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | drive |
| `Space` | brake |
| `E` | inspect the destination you are parked at |
| `M` | map |
| `R` | return to the arrival point |
| `Esc` | close the panel / map, or cancel the autopilot |

Pick **Destinations → Drive** to hand over to the autopilot: it plans an A*
route across the real road graph, shows that exact polyline on the map and on
the ground, and follows it at a curvature-limited speed. Any manual input takes
over immediately. If the destination's road is not connected to yours, the drive
fails with the reason instead of inventing a path.

## Attribution and licences

- **Map data and geometry:** © OpenStreetMap contributors, licensed **ODbL 1.0**.
- **Vector tiles:** built locally from the Geofabrik Nigeria extract with
  Planetiler (OpenMapTiles schema — © OpenMapTiles).
- **Tile format:** PMTiles (BSD-3-Clause, Protomaps).
- **Map renderer:** MapLibre GL JS (BSD-3-Clause).
- **Glyphs:** Noto Sans (`OFL-1.1`), vendored locally.
- **No third-party textures, models or HDRIs** are bundled: every 3D material is
  generated procedurally in the browser. See
  [docs/asset-manifest.md](docs/asset-manifest.md).

## Known limitations

- The 3D city is **not photogrammetry**. No free, legally reusable capture of
  this area exists, so realism comes from real footprints, real road geometry,
  PBR materials, image-based lighting and retained detail near the camera.
- The road network is **curated, not redesigned**: non-car ways, dead-end stubs
  under 45 m and ways outside the main connected component are removed. A
  surviving cul-de-sac is real street geometry; the extraction edge is still an
  edge.
- Building heights are estimates for 54 % of footprints (documented, deterministic).
- Multipolygon inner rings (courtyards) are dropped; buildings crossing the
  rectangle are skipped rather than clipped.
- No terrain elevation — Lagos is coastal plain; the ground is a flat plane at 0 m.
- Touch controls appear on coarse-pointer devices; they have been layout-tested,
  not driven on real hardware.

See [IMPLEMENTATION-REPORT.md](IMPLEMENTATION-REPORT.md) for test results and the
full list of what was verified.
