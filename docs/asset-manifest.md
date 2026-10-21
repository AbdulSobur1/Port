# Asset and licence manifest

## Shipped static assets

Everything the site serves at runtime is listed here. There are **no
third-party textures, models, HDRIs or photographs** in this project: the entire
3D look is procedural, and the only non-code files are derived geographic data,
vendored fonts and the MapLibre worker.

| Asset | Size | Origin | Licence |
| --- | --- | --- | --- |
| `public/map/lagos.pmtiles` | 0.5 MiB | `scripts/build-tiles.mjs` from the Geofabrik Nigeria extract (Planetiler v0.10.2, OpenMapTiles schema), clipped to the 906 m neighborhood | Data ODbL-1.0 (c) OpenStreetMap contributors; schema (c) OpenMapTiles |
| `public/map/maplibre-gl-worker.mjs` | 508 KiB | copied from `node_modules/maplibre-gl/dist/` by `scripts/copy-maplibre-worker.mjs` | BSD-3-Clause (MapLibre) |
| `public/map/fonts/Noto Sans Regular/*.pbf` | 3 files | vendored MapLibre glyph PBFs | OFL-1.1 (Noto Sans) |
| `public/map/fonts/Noto Sans Medium/*.pbf` | 3 files | vendored MapLibre glyph PBFs | OFL-1.1 (Noto Sans) |
| `public/data/lagos-world.json` | 40 KiB | `scripts/extract-world-data.mjs` | ODbL-1.0 |
| `public/data/lagos-graph.json` | 48 KiB | `scripts/extract-world-data.mjs` | ODbL-1.0 |
| `public/data/lagos-buildings-*.json` (9 files) | 60 KiB | `scripts/extract-world-data.mjs` | ODbL-1.0 |
| `public/data/lagos-water.json` | - | `scripts/extract-water-from-tiles.mjs` | ODbL-1.0 |
| `public/data/lagos-provenance.json` | - | `scripts/extract-world-data.mjs` | ODbL-1.0 |

### Materials are generated, not downloaded

`components/world/textures.ts` builds every texture on a `<canvas>` at runtime:
asphalt aggregate, concrete paving, ground cover, a water normal map, the facade
tile with windows, sills and storey bands, station label sprites, and the
equirectangular sky used both as image-based lighting and as the visible
background. `lib/world/geometry.ts` generates all wall, roof, road, sidewalk, curb, marking
and prop geometry from OSM footprints and centrelines. `lib/world/props.ts`
places the generated street lights and furniture along the curated roads, never
on the carriageway.

Consequence: no Poly Haven / Blender / BlenderGIS / photogrammetry asset is
bundled or required, there is no third-party visual asset whose licence could be
misread, and the facades are **procedural, not photogrammetric reconstructions**.

## Build-time data sources (never shipped)

| Source | Used for | Licence |
| --- | --- | --- |
| Geofabrik `nigeria-261015.osm.pbf` (711 MiB) | roads, buildings, water, land use, POIs, one-way tags, turn restrictions | ODbL-1.0 |
| OSMData `water-polygons-split-3857.zip` | ocean and lake fills at low zoom | Public domain |
| OSMData `lake_centerline.shp.zip` | lake labels | Public domain |
| Natural Earth `natural_earth_vector.sqlite.zip` | country/state labels (optional; zoom 6 or below is never reached by this map) | Public domain |
| Planetiler v0.10.2 jar (`tools/planetiler.jar`) | vector-tile build | Apache-2.0 |

All of these land in `data/` or `tools/`, which are gitignored, and the ZIP
deliverable excludes them.

## Runtime dependencies

| Package | Version | Licence |
| --- | --- | --- |
| next | 16.4.0 | MIT |
| react / react-dom | 19.3.0 | MIT |
| three | 0.183.2 | MIT |
| @react-three/fiber | 9.8.1 | MIT |
| @react-three/drei | 10.7.9 | MIT |
| maplibre-gl | 6.14.0 | BSD-3-Clause |
| pmtiles | 4.5.0 | BSD-3-Clause |
| pbf | 5.1.2 | BSD-3-Clause |
| @mapbox/vector-tile | 3.0.0 | BSD-3-Clause |
| osm-pbf-parser (dev) | 2.3.0 | MIT and LGPL |
| typescript (dev) | 5.9.3 | Apache-2.0 |

`@types/three` (MIT) is types-only and is not shipped.

## Attribution obligations

ODbL requires attribution and share-alike for derived databases. The site carries
"(c) OpenStreetMap contributors (ODbL)" in the intro, the HUD corner, the map
footer and the MapLibre attribution control, and the provenance file records the
source snapshot, licence and attribution string next to the data itself. The
generated world data in `public/data/` is a derivative database and stays under
ODbL.
