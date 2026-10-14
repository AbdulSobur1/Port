# Implementation report — real map, coordinate system, and hardening

This report covers the work completed in this session: replacing the decorative
ground with a **real, geographically anchored map**, defining a single documented
coordinate system, and the surrounding verification. It is written against the
original brief's phases (0–8) and states clearly what is done, what is verified,
and what could not be verified in this environment.

## Phase 0 — Audit, dependencies, baseline

- Removed the stale, tracked `package-lock.json`; the repo is pnpm-only (`pnpm-lock.yaml`, lockfile v9), which is also what Vercel uses.
- Stopped the local dev server (it held a file handle in `node_modules`) and installed **`maplibre-gl@6.13.0`** with pnpm. The hand-rolled physics engine was retained (no Rapier), per the chosen direction.
- Made `@types/three` a direct devDependency, because pnpm does not hoist transitive types and Vercel builds with pnpm.
- Verified a clean baseline before changing anything: `tsc --noEmit` exit 0, tests green, `next build` exit 0.

## Phase 1 — One coordinate system, and a real map

### `components/world/geo.ts` — the single source of truth

- **World space**: right-handed, metres, `+X` = east, `+Z` = north, `+Y` = up, origin `(0,0)` at the city centre. `WORLD_BOUNDS = 24`.
- **Anchor**: `(0,0)` maps to a real WGS84 point, `WORLD_ORIGIN`, defaulting to central Abuja, Nigeria (`9.05785, 7.49508`), overridable with `NEXT_PUBLIC_WORLD_ORIGIN="lat,lng"`.
- **Projection**: local equirectangular. `metersPerDegreeLat`/`metersPerDegreeLng` use the full WGS84 series expansion, so scale is accurate across the city, not just at the anchor.
- **Web-mercator helpers**: `metersPerPixel`, `zoomForMetersPerPixel`, `zoomForSpan`, deriving `MAP_ZOOM` from `MAP_SPAN_METERS` and `MAP_CANVAS_SIZE` (`1024`). One canvas pixel corresponds to `MAP_SPAN_METERS / MAP_CANVAS_SIZE` metres.

Conversion helpers `worldToLatLng`, `latLngToWorld`, and `worldBoundsToLatLng` are the only sanctioned bridge between the 3D world and geography. Everything else — stations, buildings, routes — stays in world space.

### `components/world/map-style.ts`

- Keyless OpenStreetMap **raster** style by default (no API key required).
- `NEXT_PUBLIC_MAP_STYLE_URL` overrides it with any MapLibre style (vector or raster) for branding or higher tile limits.
- `NEXT_PUBLIC_WORLD_MAP=off` disables the map entirely.
- `MAP_ATTRIBUTION` carries the required `© OpenStreetMap contributors` credit.

### `components/world/map-ground.ts`

- `useWorldMapTexture(enabled)` builds an **offscreen MapLibre map** (`canvasContextAttributes: { preserveDrawingBuffer: true }`, `attributionControl: false` because the credit is rendered in the DOM, `fadeDuration: 0`) centred on `WORLD_ORIGIN` at `MAP_ZOOM`, with a north-up, unrotated bearing so it aligns with `+Z = north`.
- Renders the map to a `THREE.Texture` applied to a `MAP_SPAN_METERS`-wide ground plane, so the tile edges land on world bounds.
- Returns a `status` (`disabled` | `loading` | `ready` | `unavailable`) and falls back to the procedural ground on any failure (WebGL unavailable, style error, or a 10-second timeout). The city is never left without a floor.
- `map-ground`/`map-style` are dynamically imported so MapLibre stays out of the initial bundle.

### Integration (`city.tsx`, `world-scene.tsx`, `globals.css`)

- `CitySkirt` and the base floor are hidden once the map texture is ready; the map plane takes over the ground.
- The map is disabled automatically in low-power mode.
- The DOM renders the required OpenStreetMap attribution, and `?debug=1` adds a `map: <status>` line to the diagnostics overlay.

## Phase 2 — Procedural realism

- Added merged-geometry **zebra crossings** at the four cardinal road approaches of every city (`Crossings` in `city.tsx`). They are decorative only — the collision layer in `physics.ts` is untouched — and all bars merge into a single mesh, so a full crossing costs one draw call.
- (Existing procedural detail — curbs, lane markings, street furniture, building massing variants, landmark rings, atmosphere — was already in place and left intact.)

## Phase 3 — Route graph and autopilot

- Confirmed the existing implementation already satisfies the brief: a grid route graph with **A\*** planning, autopilot follow, and sub-stepped swept collision, covered by deterministic tests (reachability from spawn to every station, no clipping through geometry, correct failure when a destination is blocked).
- No behavioural change was required; the tests act as the regression guard.

## Phase 4–6 — UI, accessibility, mobile, performance

These were largely delivered in earlier commits and remain in place (skip links, `<main id="world-main">`, ARIA labelling, `viewport-fit: cover`, dpr cap of 1, antialias off, shadows off, 6 dynamic lights, halved particles). The map layer respects all of them: it is off in low-power mode, costs one draw call, and adds no dynamic lights.

## Tests — 34 green

- `tests/geo.test.ts` (new): WGS84 scale sanity (equatorial meridional ≈ 110 574 m/°, longitudinal 111 319.49 m/°, ~half at 60°), axis orientation, origin identity, sub-millimetre round-trips, bounds bracketing, and invertible/monotonic zoom resolution.
- Existing physics and city-integrity suites continue to pass.
- `package.json#test` now compiles and runs every compiled test file via a glob, so new test files are picked up automatically.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Types | `tsc --noEmit` | exit 0 |
| Tests | `tsc -p tsconfig.tests.json && node --test "tests-dist/tests/*.test.js"` | 34 / 34 pass |
| Build | `next build` | exit 0, 33 routes |

## Honest limitations

- **No browser / GPU in this environment**, so runtime behaviour — actual tile rendering, map alignment on screen, frame rate, and draw-call counts — is reasoned from the code and verified by `next build`, not observed. Use `?debug=1` and the network tab to confirm on a real device.
- The real map needs network access to fetch OSM tiles. Offline, MapLibre reports `unavailable` and the procedural ground is used. `NEXT_PUBLIC_WORLD_MAP=off` forces that path.
- Tile usage is subject to the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). For production traffic, set `NEXT_PUBLIC_MAP_STYLE_URL` to a hosted style.
- The default raster map is a photographic top-down view; streets drawn in the designed city are the designed layout, not traced from the tiles. Aligning the two exactly would require vector-tile feature extraction and is out of scope for this pass.

## Not done (still open from the brief)

- Photoreal GLB/HDRI asset pass — explicitly descoped in favour of procedural-only assets.
- In-browser performance profiling and visual sign-off (no browser available here).
