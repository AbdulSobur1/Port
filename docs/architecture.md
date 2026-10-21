# Architecture

## Coordinate system

`lib/geo/projection.ts` is the single geographic-to-world transform. It is
dependency-free so the same code runs in the browser (scene, map) and in the
extraction script (Node), which is why the world and the map cannot drift apart.

```
WGS84 (lat, lng)  →  Web Mercator metres  →  world metres
world: +X east, +Z north, +Y up, origin at the centre of the extraction bounds
```

| Fact | Value |
| --- | --- |
| Projection | Web Mercator (spherical, R = 6 378 137 m) |
| Origin | centre of the extraction bounds (6.456°N) |
| Scale at origin | 1.0063813984 (Mercator metres ÷ ground metres) |
| Variation across the N–S extent | < 0.1 m |
| Vertical | none — OSM heights treated as metres above the ground plane |

Mercator metres were chosen over a local equirectangular plane because MapLibre
renders Web Mercator: every derived geometry lands pixel-exact on the basemap at
any zoom. The 0.64 % scale error is uniform, documented, and far below the
tolerance of a driving interaction.

**Alignment proof:** `tests/projection.test.ts` round-trips lat/lng ↔ world,
and `tests/world-data.test.ts` asserts every station snaps to the shipped road
graph within 2 m in the same coordinates the map uses.

## Scene (`components/world/`)

| File | Responsibility |
| --- | --- |
| `world-scene.tsx` | WebGL capability probe, data load with retry, error/boot/fallback states |
| `scene.tsx` | composes the layers below |
| `environment.tsx` | procedural sky as IBL **and** background, haze fog, a sun whose shadow camera follows the car |
| `terrain.tsx` | ground plane, water surface from the tile-derived polygons, parks, world edge |
| `city.tsx` | roads, buildings, trees, street lights, signals, street furniture, project stations |
| `props.ts` | deterministic street-light and furniture placement along the curated roads |
| `car.tsx` | the player vehicle (wheels roll with distance, steer with input) |
| `chase-camera.tsx` | frame-rate-independent chase camera, snaps under reduced motion |
| `simulation.tsx` | the only place the car moves: reads input, runs physics, publishes telemetry |
| `map-panel.tsx` | MapLibre map, vehicle marker, route, station markers |
| `route-ribbon.tsx` | the route drawn on the ground — the same polyline the autopilot follows |
| `hud.tsx`, `store.ts` | interface and the mutable runtime/telemetry stores |

Geometry is built by `lib/world/geometry.ts`, which emits flat-shaded
non-indexed arrays for roads (asphalt, sidewalk, curb, markings), buildings
(walls with a ground-floor plinth, triangulated roofs, roof clutter) and the
route ribbon.

**Performance strategy.** The compact world has 900 buildings in nine spatial
bundles (3 × 3); each bundle builds its geometry lazily when it first comes within
the draw radius of the camera, then caches it, and fog hides the boundary. Trees
(725), street lights (343 placed, of which 25 are surveyed) and street furniture
(63 generated pieces) are instanced. Every texture is a procedurally generated
canvas (asphalt, concrete, paving, ground, water normal map, facade tile,
station labels, sky) — zero asset downloads, zero licence surface.

## Physics (`lib/world/vehicle.ts`, `lib/world/collision.ts`)

- Kinematic bicycle model with a speed-sensitive steering limit, engine curve,
  rolling resistance and braking.
- **Fixed internal substep** (1/120 s) with the frame delta clamped, so motion is
  frame-rate independent and a long frame cannot teleport the car.
- Collision: each building footprint is reduced to its minimum **oriented**
  bounding box (longest edge defines the axis) and inserted into a uniform grid.
  The car is two circles along the chassis, each resolved out of an OBB along the
  shallowest axis. Render geometry stays detailed; physics stays a few thousand
  boxes.
- Substepping caps travel per step at ~0.23 m (27 m/s ÷ 120 Hz), well below the
  thinnest building depth, so tunnelling is impossible by construction.
- The world rectangle clamps position and bleeds speed; `R` resets to the arrival
  point. Frame-rate convergence, braking/reverse, steering lock and the boundary
  are covered by `tests/vehicle.test.ts`.

## Routing and autopilot (`lib/geo/graph.ts`, `lib/world/autopilot.ts`)

- The graph is built from drivable OSM ways at extraction time: real node ids,
  edges that are polylines between junctions (so overlays follow real curvature),
  one-way flags and OSM turn restrictions honoured, plus edge speed limits.
- 173 nodes / 225 edges after curation, all in one connected component. The
  extractor previously shipped a 10 km district-scale graph; the curate step now
  removes non-car ways, short dead-end stubs and fragments outside the largest
  component *before* the graph is built, so the autopilot never sees a road the
  scene does not render.
- Planning is **A\*** over that graph from the car's nearest edge to the station's
  edge. There is no straight-line fallback anywhere.
- Following is pure pursuit + curvature-limited speed, returning the same
  `DriveCommand` shape the keyboard produces — so the autopilot is subject to
  exactly the same physics, collision and boundaries as the player.
- Obstruction recovery re-plans once, then fails with a reason. Manual input
  cancels immediately. Covered by `tests/graph.test.ts` and `tests/autopilot.test.ts`.

## Map

- `lib/map/style.ts` is a hand-written MapLibre style against the OpenMapTiles
  schema Planetiler emits: background, landcover, landuse, park, water, waterway,
  building, road casing/road, road labels, place labels, POIs, water names,
  boundaries. **No demo style and no third-party tile endpoint** — the only
  sources are our own archive and locally vendored glyphs.
- The archive is `public/map/lagos.pmtiles` (≈0.5 MiB, OSM max zoom 15) served
  with byte-range requests; `pmtiles` is registered as a MapLibre protocol. It is
  clipped to the same 906 × 907 m rectangle as the world, so the map cannot show
  the old district.
- MapLibre derives its worker URL from `import.meta.url`; after bundling that
  points inside `/_next/static/chunks/`, where no worker exists, and the map
  hangs. `scripts/copy-maplibre-worker.mjs` copies the self-contained worker into
  `public/map/` (run automatically by `predev`/`prebuild`) and
  `setWorkerUrl()` points MapLibre at it.
- The panel builds its overlays on `style.load`, not `load`: `load` waits for
  every source's first pass, so one slow tile range could leave the panel on
  "Loading street data…" forever.
- The vehicle marker, route and station markers are driven from the same
  telemetry and `runtime.route` the autopilot writes, so the map can never show
  a path the car is not following. `tests/graph.test.ts` covers marker/route
  synchronisation inputs.

## Interface

Desktop keeps the 3D world primary: a compact top bar, a collapsed map, a
destination rail, and a dossier sheet opened on demand. Mobile is designed for
touch: reduced HUD, expandable map, and steer/throttle/brake controls that hide
while a panel or the map is open.

Accessibility: skip link, landmarks, labelled controls, `aria-live` status and
route announcements, keyboard-only navigation, focusable dossier sheet,
reduced-motion support, a WebGL-free fallback that lists every project, and a
readable error state with retry.

The portfolio record itself (projects, links, contact details) lives in the
pages under `app/` and in `lib/`; the 3D world is a way of navigating it, never
a replacement for it — the full project list is always in the DOM for search
engines and screen readers.
