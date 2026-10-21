# Implementation report

Project: **Soburr — a drivable Lagos portfolio**
Workspace: `C:/Users/NEW USER/Pictures/Portfolio`
Date: 2026-10-20

## 1. Starting point

The repository already contained a working geographic pipeline (pinned Geofabrik
Nigeria extract → Planetiler PMTiles → extracted world/graph/building data) and a
Next.js + react-three-fiber world with its own MapLibre map. Earlier sessions
fixed the blank-page renderer crash, the poisoned world-load cache, the MapLibre
worker 404, map readiness, and the dusk lighting. Every automated check passed
while those product failures existed; they were only visible in a browser.

The revision covered by this report addresses the next round of product
failures: the world was **district-sized** (10.0 × 9.9 km) with 5 935 road ways,
which read as scattered fragments rather than a neighbourhood, and the vehicle
was a generic box. It replaces that with a **compact 561 × 565 m playable core**
inside a 906 m extraction rectangle, a curated 104-way network, and a bespoke
vehicle and street dressing proportioned for it.

## 2. Defects found and fixed

### 2.1 Renderer crash: unbounded loop in the lane-marking builder (fatal)

`lib/world/geometry.ts` placed dashed lane markings with a floating-point cursor
(`cycle = localStart % period`). When a dash boundary landed within rounding
distance of the cursor, `remain = dash - cycle` became ~1e-13, so each iteration
pushed two triangles and advanced the cursor by ~1e-13. The arrays grew until V8
threw `RangeError: Invalid array length` (±4.29e9 elements), which took the
renderer process down — the browser showed "This page couldn't load".

Reproduced deterministically in Node (no browser needed) and fixed by deriving
each dash from its grid index, so every iteration advances the grid by one.
Sub-pixel dashes (< 0.4 m) are skipped.

### 2.2 Shared world load could be poisoned by an aborted consumer

`loadWorld(signal)` cached one promise built with the first caller's
`AbortSignal`. A React remount aborted that promise, and every later reader got
"signal is aborted without reason" instead of the world. The shared request is no
longer signal-bound (retries already live in `getJson`, and a genuine failure
still clears the cache).

### 2.3 The map never loaded — two separate causes

1. **Worker URL.** MapLibre 6 derives its worker URL from `import.meta.url` and
   expects `./maplibre-gl-worker.mjs` next to itself. After bundling that resolves
   inside `/_next/static/chunks/`, where no worker exists, so Next answered with
   an HTML 404 and the module worker was rejected on MIME grounds. Fixed with the
   supported API: `scripts/copy-maplibre-worker.mjs` (run by `predev`/`prebuild`)
   copies the self-contained worker into `public/map/`, and the panel calls
   `maplibregl.setWorkerUrl('/map/maplibre-gl-worker.mjs')`.
2. **Readiness signal.** Overlays were added on MapLibre's `load`, which only
   fires after every source has completed its first pass; one slow range request
   left the panel on "Loading street data…" indefinitely. The panel now builds its
   overlays on `style.load` and keeps `load` as a secondary readiness signal. Map
   errors are also surfaced instead of being filtered down to tile-ish messages.

### 2.4 Daylight look

The scene rendered as dusk: road/sidewalk/roof vertex tints multiplied the albedo
down to ~0.09, and the visible background was the dark page colour. Road tints
are now ~1.85× brighter (documented as dry-asphalt reflectance), facades, roofs
and sidewalks follow, and the procedural sky is used as the scene *background*
(not only the IBL source), so the horizon matches the haze the buildings fade
into.

### 2.5 Compact neighbourhood instead of a district

The extraction rectangle is now
`3.39366, 6.45166 → 3.40180, 6.45976` — the north-west Lagos Island grid around
Glover, Oshodi and Adeniji Adele. The world is 906 × 907 m with a **561 × 565 m
playable core** (31.7 ha); `meta.playable` records both the geographic bounds and
the world-space rectangle.

Consequences, all verified by the shipped-data tests:

- 900 buildings instead of 44 653, in nine 3 × 3 chunks (60 KiB total).
- 104 curated ways instead of 5 935, 15.73 km of drivable centreline.
- One connected graph of 173 nodes / 225 edges instead of 8 145 / 9 988 with 41
  components.
- The PMTiles archive is clipped to the same rectangle (0.5 MiB instead of
  3.0 MiB), so the map cannot show the old district.
- Every destination is inside the playable core and reachable from the spawn on
  the shipped graph.

### 2.6 Curation before graph and geometry

`scripts/lib/curate-roads.mjs` filters the raw extract before either the graph or
the render meshes are built, so the asphalt, intersections, collision data and
routing all come from the same surviving set:

1. drop non-car classes;
2. enforce a 6 m minimum carriageway;
3. iteratively prune dangling stubs under 45 m and fragments under 12 m;
4. keep the largest connected component using the app's own graph builder, then
   prune again because removing a fragment exposes new stubs;
5. protect any way within 30 m of a portfolio station.

Result: 142 candidate ways → 104 shipped, 15.73 km. 6 non-car ways, 11 stubs,
10 fragments and 11 ways outside the main component were removed. Station-adjacent
ways are exempted from pruning in every pass, so no destination can be orphaned.
No geometry was invented. The provenance file stores every count and the
remaining limitations. `scripts/validate-world.mjs` re-checks the shipped
artifacts, not the build command.

### 2.7 Autopilot stopped at the wrong end of the station's street

A* targets a graph node, but a station sits mid-edge. When the nearest node was
the far end of the station's own street, the route drove past the marker and
doubled back; geometrically connected, but the car braked at the wrong place.
`lib/world/autopilot.ts` now truncates the final polyline at the closest approach
to the station (and the reverse initial spur when needed), so the planned route
ends at the marker. `tests/autopilot-world.test.ts` now drives the real shipped
world at 60 Hz with the real collision grid to every destination, rather than
only checking that a route exists.

### 2.8 Visual quality: vehicle, street dressing, landmarks

- `components/world/car.tsx` is a bespoke side-profile extrusion at real
  proportions (4.4 × 1.86 m, 2.72 m wheelbase): long bonnet, raked windshield,
  fast rear glass, shoulder crease, separate glasshouse, wheel arches, detailed
  wheels, brake lights and mirrors. No downloaded GLB is shipped, so there is no
  unverified model licence.
- `lib/world/props.ts` generates street lights and furniture (benches, bins,
  planters, wayfinding signs) along the curated roads, offset clear of the
  carriageway and avoiding station plinths. Generated, and documented as such.
- Station landmarks moved off the carriageway; the spawn is no longer inside a
  7 m black slab.
- `components/world/city.tsx` keeps building detail near the camera and fades it
  into haze; `environment.tsx` keeps the sky and IBL consistent.

### 2.9 Interface and documentation

- The HUD now reports the **playable** rectangle (561 × 565 m) from
  `meta.playable`, not the old `10.0 × 9.9 km` hard-coded string.
- README, architecture, geo-pipeline, asset manifest and the map/validation notes
  now describe this compact world, its counts, curation rules and file sizes.
- Temporary probe scripts and screenshots from this session are excluded from
  the deliverable.

## 3. Verification actually performed

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` (`tsc --noEmit`) | **pass**, 0 errors |
| Unit/integration tests | `npm test` (`node --test "tests/*.test.ts"`) | **41 / 41 pass**, 0 fail |
| Shipped artifact audit | `npm run world:validate` | **PASS** (see `docs/world-validation.md`) |
| Production build | `npm run build` | **pass** (Next 16.4, TypeScript, static pages) |
| Desktop scene | Chromium, 1440 × 900 | road surface, sidewalks, buildings, trees, car and the new 561 × 565 m HUD label render |
| Autopilot | 60 Hz test over shipped data | routes end at the station; the car arrives at all eight destinations without a deadlock |
| Map | Chromium, earlier build | PMTiles streets, water, building footprints, station markers |

The 41 tests cover: projection round-trip, Mercator scale and world bounds;
graph construction, one-way handling, disconnected components, turn
restrictions, snapping and polylines; vehicle behaviour at 30/60/144 Hz, one
huge frame, building collision, wall sliding, world boundary, braking and
reverse, steering lock and recentring; autopilot planning, failure on an
unreachable destination, following and arrival, speed sanity, monotonic progress
and curve speed; a full 60 Hz autopilot drive over the shipped world and
collision grid; and the shipped data itself (compact extent, curated road
density, building bundles, station snapping, single connected graph, every
destination reachable, planned routes on mapped roads and out of buildings, map
clip, provenance).

### Not verified

- **Linting.** The repository has no linter configured. ESLint is not installed
  and there is no ESLint config; the dead `next lint` script was removed rather
  than left to fail misleadingly. Type checking (strict) and the production build
  both pass.
- **Real touch input.** The touch controls are gated on `(pointer: coarse)`;
  this environment reports a fine pointer. The mobile layout was checked on an
  earlier build and this revision did not change layout CSS, but steering was
  not exercised on a physical device.
- **Deployment host.** Range-request behaviour and caching for the archive were
  verified on the local Next server only. Nothing was deployed.
- **Reduced-motion and screen-reader behaviour** were implemented and reviewed
  but not exercised with a real assistive technology.

## 4. Data and assets

- Source: Geofabrik `nigeria-261015.osm.pbf`, 710 882 130 bytes,
  SHA-256 `14f14d59…f363`, snapshot 2026-10-15T20:21:00Z, ODbL-1.0.
- Extraction bounds: `west 3.39366, south 6.45166, east 3.40180, north
  6.45976` — a 906 × 907 m rectangle, not an official neighbourhood boundary.
- Playable: 561.1 × 564.6 m (31.7 ha).
- Extracted: 900 buildings (414 with levels, 486 estimated), 104 curated road
  ways, 173 graph nodes / 225 edges / one component, 2 water polygons, 3 POIs,
  725 trees, 25 surveyed street lights, 2 crossings, 9 stations.
- Shipped: 0.5 MiB PMTiles, 40 KiB world, 48 KiB graph, 60 KiB building chunks,
  3 KiB water. The 711 MiB PBF and Planetiler jar stay in gitignored `data/` and
  `tools/`.
- **No third-party 3D assets**: every texture is generated on a canvas at runtime
  (`docs/asset-manifest.md`).

## 5. Documentation

| File | Contents |
| --- | --- |
| `README.md` | what is real vs generated, stack, commands, coordinates, driving, licences, limitations |
| `docs/geo-pipeline.md` | source pin and hashes, compact bounds rationale, tool versions, reproduction steps, counts, curation rules, outputs, hosting requirements |
| `docs/architecture.md` | coordinate system, scene layers, performance strategy, physics, routing/autopilot, map, interface |
| `docs/asset-manifest.md` | every shipped asset with origin and licence; dependency licences; attribution obligations |
| `docs/world-validation.md` | generated, machine-checked audit of the shipped world and map |
| `.env.example` | documents that no secrets are required; optional extraction flag only |
| `IMPLEMENTATION-REPORT.md` | this report |

## 6. Runtime dependencies

Node 20+ (used: 24.16) and pnpm. Next 16.4, React 19.3, three 0.183,
@react-three/fiber 9.8, @react-three/drei 10.7, MapLibre GL JS 6.14, PMTiles 4.5,
`pbf` 5.1, `@mapbox/vector-tile` 3.0. Extraction additionally needs Java 21+,
Planetiler v0.10.2 and the pinned public-domain background archives. No paid
service, API key or subscription is required at build time or at runtime.

## 7. Remaining limitations

- The 3D city is stylised, not photogrammetric: no free, legally reusable capture
  of this area exists. Realism comes from real footprints and road geometry,
  generated PBR-style materials, image-based lighting and near-field shadows.
- 54 % of building heights are deterministic estimates, flagged as such.
- Multipolygon inner rings are dropped; buildings crossing the rectangle are
  skipped rather than clipped; turn restrictions with a way `via` member are
  skipped.
- No terrain elevation (coastal plain, flat plane at 0 m).
- Street trees, street lights beyond the 25 surveyed, furniture and the nine
  destination landmarks are generated placements, never presented as local
  landmarks.
- The playable edge is a curated rectangle: surviving cul-de-sacs are real street
  geometry, but the boundary is not a neighbourhood boundary.
- World and map are drawn from the same coordinate transform, but the map is a
  separate renderer: a tile-archive failure degrades the map panel only.
