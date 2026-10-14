# World validation

Verification log for the asset-augmented world. Commands were run in this
repository; results below are the real outputs.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm exec tsc --noEmit` | **pass** (0 errors) |
| Unit / physics tests | `pnpm test` | **34 passed, 0 failed** |
| Production build | `pnpm build` | **pass** — 33/33 routes prerendered |

The test suite covers vehicle physics, collision resolution across all four
cities, autopilot routing and the WGS84 geo math. The asset layer adds no
colliders and changes no layout data, so it is intentionally invisible to these
tests — the suite passing unchanged confirms driving behaviour was not disturbed.

## Asset validation

Every model/material/HDRI referenced by `components/world/assets.ts` was
downloaded and its files verified present and non-empty (`public/world/`):

- Models (glTF + `.bin` + `textures/`): `street_lamp_01`,
  `modular_street_seating`, `concrete_road_barrier`, `fire_hydrant`,
  `planter_box_01` — 5 models.
- Materials (`diff` + `nor_gl` + `arm`, 1K JPEG): `asphalt_01`,
  `concrete_pavement_02`, `rectangular_facade_tiles`, `concrete`, `metal_plate`
  — 5 sets.
- Environments (1K HDR): `qwantani_dusk_1`, `satara_night` — 2.
- Total payload: **34.1 MB across 54 files** — copied verbatim into the build.

Reference integrity: each glTF's `buffers[].uri` and `images[].uri` were read
back and confirmed to resolve to files that exist beside the model (e.g.
`street_lamp_01.bin`, `textures/street_lamp_01_arm_1k.jpg`).

## Design validation against the brief

| Requirement | Status |
| --- | --- |
| Assets validated for compatibility & licence | ✅ all CC0, all glTF/PBR |
| Photoreal materials replace flat placeholders | ✅ roads, paving, facades |
| Real street props | ✅ lamps, benches, planters, hydrants, barriers |
| Image-based lighting / HDR environment | ✅ dusk + night HDRIs |
| Perf & render budget respected | ✅ 1K textures, shared materials, IBL off on low-power |
| Collision & driving accessibility preserved | ✅ no collider changes; 34/34 tests |
| Graceful fallback if assets fail | ✅ loaders are best-effort; base world always renders |
| Full disable switch | ✅ `NEXT_PUBLIC_WORLD_ASSETS=off` |

## Runtime verification — honest limitations

This environment has **no browser and no GPU**, so the following could **not** be
executed here and are **not** claimed as measured:

- Perceived visual result (scale of the glTF props against the massing, exact
  orientation of each Poly Haven model, material/tint balance under the HDRI).
- Frame-rate / frame-time on real hardware.
- Mobile / touch rendering.

Mitigations already in place:
- Models are **auto-normalised** at load: each is scaled to an explicit target
  height and its bounding box is recentred with its base on `y = 0`, so an
  unexpected export scale or pivot can't misplace it.
- The IBL is skipped on coarse-pointer / reduced-motion devices and the DPR cap
  is preserved, so low-power paths are unchanged.
- A human can verify quickly with `?debug=1` (on-screen perf overlay) and by
  toggling `NEXT_PUBLIC_WORLD_ASSETS=off` to compare worlds.

## How to verify manually

1. `pnpm dev`, open `/` — the plaza should show textured asphalt/paving, a
   dusk HDRI reflection on the concrete, real lamp posts and hub furniture.
2. Visit `/work`, `/about`, `/contact` — same props/materials, HDRI switches to
   the night sky for `/work` and `/contact`.
3. Set `NEXT_PUBLIC_WORLD_ASSETS=off`, restart — the world must look exactly as
   it did before this change (procedural fallback).
4. Drive into the plaza ring and confirm you still cannot clip any prop or
   building (collision is unchanged).
