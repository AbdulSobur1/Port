# Baseline audit — Soburr 3D world

**Phase 0 deliverable.** This is the state of the world *before* the production-grade
redesign changes. Every number and file path below was read from the repository at
commit `0013b6ec` (branch `main`) with a working tree that already contains the
light-mode pass and the first data-driven road layer (see *Working-tree state*).

The environment has **no GPU and no browser**, so nothing here is a visual or
frame-rate measurement. All claims are static (source, config, tests) or verified
by the Node unit-test runner.

---

## 1. Repository shape

| Thing | Value |
| --- | --- |
| Framework | Next.js `16.4.0` (App Router), React `19.3.0` |
| 3D stack | `three@0.183.2`, `@react-three/fiber@9.8.1`, `@react-three/drei@10.7.9` |
| Map | `maplibre-gl@^6.13.0` |
| Animation | `framer-motion@12.43.0` |
| TypeScript | `5.9.3`; tests compiled with `tsconfig.tests.json` then run by `node --test` |
| Package manager | pnpm `11.18.0` (npm is broken in this environment) |
| Routes | `/` (hub), `/work` (work), `/about` (about), `/contact` (contact), `/work/archive`, `/work/[slug]` |
| World owners | `app/page.tsx`, `app/work/page.tsx`, `app/about/page.tsx`, `app/contact/page.tsx` each render `<WorldLoader worldId=… />` |

**Verification entry points**

| Check | Command | Baseline result |
| --- | --- | --- |
| Types | `& ".\node_modules\.bin\tsc.cmd" --noEmit` | exit `0` |
| Tests | `pnpm test` | **34 passed / 0 failed** (`tests/geo, physics, cities`) |
| Build | `& ".\node_modules\.bin\next.cmd" build` | previously **33/33 routes** prerendered |

---

## 2. World systems inventory (file → responsibility)

Sizes are line counts of the current working tree.

### 2.1 Layout & data (React/three-free — unit-testable)

| File | Lines | Owns |
| --- | --- | --- |
| `components/world/world-layout.ts` | 230 | The single source of truth: `Road`, `Ring`, `District`, `WorldTheme`, `BuildingSpec`, `Station` types; the hub `buildings`, `lampPositions`, `treePositions`, `landmark`, `perimeterWalls`, `spawn`, `hubLayout` (incl. `roads` + `districts`). Shared by the renderer **and** physics. |
| `components/world/world-cities.ts` | 177 | `work`, `about`, `contact` layouts built from `lib/projects.ts`; theme per city; `worldLayouts` map; `worldMeta`. |
| `components/world/geo.ts` | 119 | World↔WGS84 equirectangular projection, `WORLD_ORIGIN` (Abuja `9.05785, 7.49508`), `MAP_SPAN_METERS=220`, `MAP_CANVAS_SIZE=1024`. DOM/three-free. |
| `components/world/time-of-day.ts` | 115 | Pure stylised palette sampled from hour + `timeBand`; `animateHour`, `samplePalette`, colour lerp helpers. |
| `lib/projects.ts` | 210 | 20 project records + 8 forks. Data only. |

## 2. Renderer (R3F)

| File | Lines | Responsibility |
| --- | --- | --- |
| `components/world/city.tsx` | **839** | The whole visible city: `Roads`, `Districts`, `HubFloor`, `DistrictFloor`, `Crossings`, `GroundDetails`, `Building`, `UrbanDetails` (instanced lamps/trees), `PerimeterWall`, `CentralLandmark`, `StationPads`, `StationPedestal`, `PortalGate`, `city-art`, `VehicleMesh` + `Wheel`, `CitySkirt`, `MapPlane`, and the `World` root. |
| `components/world/asset-layer.tsx` | 211 | Additive photoreal layer: IBL `Environment`, textured ground (asphalt/pavement), building skins, real Poly Haven props, hub furniture. |
| `components/world/assets.ts` | 223 | Asset manifest (`MODELS`, `MATERIALS`, `ENVIRONMENT`) + non-suspending cache-backed loaders (`useModel`, `useMaterial`), `normalize()`, `preloadWorldAssets()`, `WORLD_ASSETS_ENABLED`. |
| `components/world/atmosphere.tsx` | 302 | Day/night rig (`Atmosphere`), sky dome canvas, stars, sun/moon sprites, rain, snow, `Glow` additive sprite. |
| `components/world/map-ground.ts` | 122 | Renders a static MapLibre view offscreen → `THREE.CanvasTexture` ground plane; 8 s timeout → `unavailable`. |
| `components/world/chase-camera.tsx` | 48 | Speed-scaled chase camera. |
| `components/world/diagnostics.tsx` | 46 | `PerfProbe` (FPS/calls/tris/GPU, 1 Hz) + `PerfOverlay` (`?debug=1`). |
| `components/world/adaptive-quality.tsx` | 48 | 1 Hz FPS sampler → `onDecline`/`onIncline`. |

## 3. Simulation / interaction

| File | Lines | Responsibility |
| --- | --- | --- |
| `components/world/physics.ts` | 430 | Authoritative motion model + collision + A* routing. `createWorld(layout)` builds an isolated collider set; module-level `stepVehicle`, `planRoute`, `stepAutopilot`, `isPointDrivable`, `colliders` bound to the hub. No React/three. |
| `components/world/simulation.tsx` | 117 | One `useFrame` step/frame: autopilot route advance, portal trigger, panel pause, nearest-zone publish. |
| `components/world/store.ts` | 137 | `useSyncExternalStore` UI state; module-level `vehicle` ref + `input` object (never triggers React). |
| `components/world/hud.tsx` | **527** | All DOM UI: keyboard/touch controls, dossiers, welcome card, project directory, destination map, footer. |
| `components/world/audio.ts` | 138 | Procedural WebAudio engine/wind/horn (created on first gesture). |
| `components/world/world-scene.tsx` | 102 | `<Canvas>` host, WebGL detection, quality/debug flags, mounts `World`/`ChaseCamera`/`Simulation`/`Hud`. |
| `components/world/world-loader.tsx` | 36 | `dynamic(..., { ssr:false })` wrapper. |
| `app/globals.css` | 608 | Site + HUD styling. Lines 411–608 are the appended light-mode override layer. |

---

## 4. How the world currently works (data flow)

```
WorldLayout (world-layout.ts / world-cities.ts)
        │  (single source of truth)
        ├──► createWorld(layout) ──► colliders + bounds        (physics.ts)
        │                                   │
        │                                   ▼
        │                       stepVehicle / planRoute / stepAutopilot
        │                                   │
app/*/page.tsx ─► WorldLoader ─► WorldScene ─► Simulation (useFrame) ─► store.vehicle
                                        │                                    │
                                        ▼                                    ▼
                                      World (city.tsx) ◄────── ChaseCamera, VehicleMesh (useFrame)
                                        │
                                        ├── Districts / Roads / floor / buildings  (procedural)
                                        ├── AssetLayer (materials, glTF props, HDRI) (additive)
                                        └── Atmosphere (sky, sun, weather)
Hud (hud.tsx) ◄── store.useUi() ── discrete UI only
```

- **Physics is hand-rolled**, not Rapier/Cannon. A collision circle (`VEHICLE_RADIUS=0.8`)
  is resolved against circle/box colliders with sub-stepping (`<=` 1 m steps) and
  wall-sliding; A* over an 8-connected grid provides autopilot routing. This is
  cheap and fully unit-testable — and is the constraint the vehicle redesign must
  respect.
- **The renderer and physics share `WorldLayout`.** Buildings can never be visually
  solid but physically absent. Any layout change is automatically a collision change.
- **Assets are additive and opt-out.** `NEXT_PUBLIC_WORLD_ASSETS=off` returns the
  world to procedural-only; the base city always renders under the photoreal layer.

---

## 5. Bottlenecks & risks (static assessment)

| # | Area | Observation | Risk |
| --- | --- | --- | --- |
| B1 | **Roads are drawn as overlapping flat quads** | `HubFloor`/`DistrictFloor` lay road planes + separate plaza rings + curbs + markings as independent meshes; `asset-layer.tsx` *also* paints asphalt strips (`lanes`) at nearly the same Y. At junctions, planes overlap and z-fight. There is no junction geometry, no corner radius, no sidewalk/curb network derived from the roads. | Directly named in the redesign brief ("no overlapping rectangle planes"). |
| B2 | **`city.tsx` is a 839-line god module** | Every visual system lives in one file; adding architecture variety multiplies it. | Hard to extend/verify; a refactor target. |
| B3 | **Vehicle is a bespoke parametric mesh** | `VehicleMesh` + `Wheel` (extruded silhouettes) is tied to the physics footprint. No GLB. | Brief asks to replace the generic car. |
| B4 | **Only two HDRIs, both low-sun** | `qwantani_dusk_1` and `satara_night` only. `environmentForHour` maps 06:00–18:59 → *dusk*. The brief's world is bright daylight. | IBL lights every surface with a dusk sky → the "bright day" mood is approximated, not real. |
| B5 | **Atmosphere can still render night** | `time-of-day.ts` `samplePalette` derives `dayFactor`/stars/moon from the hour; `Stars`, moon sprite and weather remain wired even though the site is light-only. `timeBand` drifts hours (e.g. hub 11→14). | A drift band can still cross dusk; must be audited so the world stays in daylight. |
| B6 | **Draw-call count is moderate but unmeasured** | `Building` emits ~7 meshes each × ~23 buildings in the hub + instanced furniture + per-station fixtures + asset-layer skins. Nothing is merged/LOD'd at the building level. | Perf budget (60 FPS desktop / ≥30 low) is unverified; no GPU here. |
| B4 (perf) | **Map plane is a 1024² static texture at 220 m span** | Dominates ground detail; fixed. | Fine, but the map is not art-directed to the brief's palette. |
| B6 | **Test-encoded coordinates are hub-specific literals** | `tests/physics.test.ts` hardcodes `(21.4, 4.2)`, `(-13.2,20)`, `(0,18)`, `(-18,18)`, `(0,12)`, `(0,9)`; `tests/cities.test.ts` is layout-derived and generic. | Any road/building redesign that moves geometry will break `physics.test.ts` unless it is first refactored to be layout-derived. |
| B7 | **Duplicated/overlapping ground systems** | `MapPlane` (real map) + `showBase` procedural plane + `Roads` + `CitySkirt` + asset-layer ground all coexist; visibility toggled by `hasMap`. | Layering conflicts; a source of flicker and confusion. |
| B8 | **Weather is wired but unused** | `WorldTheme.weather` supports `rain`/`snow`; all four cities are `'clear'`. | Dead-but-shipped code; verify it doesn't contradict the light-only brief. |

---

## 6. Asset inventory (local, `public/world/`)

54 files, **34.1 MB**. All **CC0 1.0** (see `docs/THIRD_PARTY_ASSETS.md`).

- **Models (glTF + `.bin` + textures):** `street_lamp_01`, `modular_street_seating`,
  `concrete_road_barrier`, `fire_hydrant`, `planter_box_01`.
- **Materials (diff/nor/arm 1K JPG):** `asphalt_01`, `concrete_pavement_02`,
  `rectangular_facade_tiles`, `concrete`, `metal_plate`.
- **Environment (1K HDR):** `qwantani_dusk_1_1k.hdr`, `satara_night_1k.hdr`.

**Gaps for the redesign (categories the brief requires that are not present):**
tree/foliage, signage, vehicles/vehicle GLB, additional architecture, additional
daylight environment, and any dedicated "innovation"/"garden" props.

**Duplication:** the two-point-light fill rig in `city.tsx` (`World`) and the
`Atmosphere` rig both light the scene; asset-layer props placed by hand in
`HubProps` duplicate positions already covered by `lampPositions`.

---

## 7. What is already correct and must be preserved

- Collision is derived from layout; 34 tests guard it.
- No React renders per frame (motion lives in `store.vehicle` + `useFrame`).
- Assets are additive and fully disable-able (`NEXT_PUBLIC_WORLD_ASSETS=off`).
- Coordinate system is documented and unit-tested (`geo.ts`).
- Light-only styling already appended in `globals.css` (lines 411–608) without
  touching layout classes.

---

## 8. Working-tree state (uncommitted, part of this pass)

`git status` shows `IMPLEMENTATION-REPORT.md`, `README.md`, `app/globals.css`,
`components/world/city.tsx`, `components/world/world-cities.ts`,
`components/world/world-layout.ts` modified. These contain the light-mode pass and
the first `Roads`/`Districts` layer described above.

## 9. Baseline verification (run in this repo)

```
$ tsc --noEmit            -> exit 0
$ pnpm test               -> tests 34 | pass 34 | fail 0
$ git branch --show-current-> main
```

---

## 10. Files the redesign will touch

| File | Planned change |
| --- | --- |
| `components/world/world-layout.ts` | District/road schema expansion; 5-district hub layout; keep types test-friendly. |
| `components/world/world-cities.ts` | Rebuild district cities' roads/rings/districts; add districts to contact city. |
| `components/world/city.tsx` | Junction/curb/sidewalk generation from roads; architectural variety; vehicle swap; de-duplicate ground. |
| `components/world/physics.ts` | Only if collision geometry is derived differently; must keep exported API. |
| `components/world/assets.ts` / `asset-layer.tsx` | Register new models/materials/HDRI; integrate new props. |
| `components/world/atmosphere.tsx` / `time-of-day.ts` | Bright-day IBL/palette; light-only guarantees. |
| `components/world/hud.tsx` | Navigation hierarchy; ensure work/about/contact reachable without driving. |
| `tests/physics.test.ts` | Refactor hard-coded positions to be layout-derived. |
| `docs/world-redesign/*`, `docs/THIRD_PARTY_ASSETS.md`, `README.md`, `IMPLEMENTATION-REPORT.md` | Documentation + provenance. |
| `public/world/**` | New CC0 assets. |

---

## 11. Honest limitations of this audit

- No browser/GPU: no frame times, no visual confirmation, no measured draw calls
  (draw-call numbers in a browser are only ever captured by `PerfProbe` at runtime).
- Network probing in this environment is partial (Poly Haven + ambientCG reachable;
  the GitHub HEAD probe failed under PowerShell NonInteractive mode) — see Phase 1.
- The layout is data-driven, so the collision/visual consequences of a redesign are
  *analytically* predictable from `WorldLayout`, but their *look* is not verifiable here.
