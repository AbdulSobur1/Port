# World Redesign — Test Report

Environment: Windows, Node `v24.16.0`, pnpm `11.18.0`. No browser or GPU is
available in this environment, so **appearance and frame-rate are not observed**
and are not claimed.

## Commands run

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **exit 0** |
| Unit / integration tests | `pnpm test` | **34 passed / 0 failed** |
| Production build | `pnpm build` (`next build`, Turbopack) | **compiled successfully, 33 routes** |

`pnpm test` runs `tsc -p tsconfig.tests.json` then `node --test "tests-dist/tests/*.test.js"`.

## Suite breakdown

| Suite | Tests | Covers |
| --- | --- | --- |
| `tests/cities.test.ts` | 12 | Per city (hub/work/about/contact): spawn clear & in-bounds; every station drivable & reachable; autopilot reaches every station without clipping |
| `tests/geo.test.ts` | 10 | WGS84 scales, world↔lat/lng round-trip, bounds, zoom resolution |
| `tests/physics.test.ts` | 12 | Spawn clearance, anti-tunnel at high speed, wall-slide/reverse, landmark solidity, no-spin-when-stationary, perimeter wall, corner escape, destination reachability, autopilot, blocked-route failure |

All 34 pass. The physics suite imports colliders and layout data from
`components/world/world-layout.ts`, so it is the regression guard that the
visible geometry and collision geometry cannot drift.

## Redesign changes checked

- The road-network redesign (junctions, kerbs, sidewalks) is **render-only**; it
  adds no colliders, so the physics tests are unaffected and still pass.
- The `time-of-day.ts` light-only clamp and the daylight HDRI selection are pure
  data/render changes; no layout or route data changed.
- The hub district renames are visual-only; tests do not consume `districts`.
- `assets.ts` / `asset-layer.tsx` changes are additive; all module and type
  checks pass.

## Honest limitations

1. **No visual verification.** Without a browser/GPU, the redesign's junctions,
   kerbs, district tints, facade-material variety and the raised daylight are
   reasoned from geometry and confirmed to compile and build — they are not
   observed. Verify on a real device with `?debug=1` (FPS, draw calls).
2. **Hardcoded physics-suite coordinates.** `tests/physics.test.ts` still uses
   literal points for the perimeter-wall and representative-building cases
   (`(21.4, 4.2)`, `(-13.2, 20)`, `(0, 18)`, `(-18, 18)`, `(0, 12)`, `(0, 9)`).
   These are layout-coupled but not yet fully layout-derived; they are valid for
   the current hub and would need updating if the hub collider layout changes.
3. **Payload.** `public/world` grew to 48.6 MB after the curated additions. The
   higher-detail facade/tree/fence sets were deliberately deferred to stay in
   budget (see `asset-catalog.md`).
4. **No automated performance test.** The adaptive-quality system exists
   (`adaptive-quality.tsx`) but its budget (60 FPS desktop / ≥ 30 low) is not
   machine-verified here.
