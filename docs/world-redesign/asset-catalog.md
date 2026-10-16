# World Redesign — Asset Catalog

Every asset shipped in `public/world` is **CC0 1.0** and sourced from
[Poly Haven](https://polyhaven.com) (models, textures, HDRIs). Provenance is
mirrored in `docs/THIRD_PARTY_ASSETS.md`.

Sizes below are the **actual on-disk bytes** measured after download (not the
API's advertised sizes). All material sets are the 1K tier (`_1k`); models use
the 1k glTF variant.

## 1. Environment / IBL

| Id | File | Format | Size | Source |
| --- | --- | --- | --- | --- |
| `daylight` | `environment/kloofendal_43d_clear_1k.hdr` | HDR equirect | 1.45 MB | Poly Haven — `kloofendal_43d_clear` |
| `dusk` (fallback, unused) | `environment/qwantani_dusk_1_1k.hdr` | HDR | 1.20 MB | Poly Haven `qwantani_dusk_1_1k` |
| `night` (retired) | `environment/satara_night_1k.hdr` | HDR | 1.20 MB | Poly Haven `satara_night_1k` |

`kloofendal_43d_clear` is a clear, high-noon sky dome — strong sun, blue zenith,
soft ground bounce. It is the single IBL for all five districts (light-only
world; see `world-art-direction.md`). The dusk/night HDRIs remain in the
manifest as documented fallbacks but are never selected by the running site.

## Materials (PBR, 1k, diffuse + OpenGL normal + ARM packed)

The loader (`components/world/assets.ts`) maps each set to
`/world/materials/<id>/<id>_{diff,nor_gl,arm}_1k.jpg`.

| Loader id | Poly Haven id | Diff/nor/arm | Total | Use |
| --- | --- | --- | --- | --- |
| `asphalt` | `asphalt_01` | 0.30/0.63/0.32 MB | 1.25 MB | Road surfaces |
| `pavement` | `concrete_pavement_02` | 0.62/0.86/0.31 MB | 1.79 MB | Sidewalks / plaza |
| `facade` | `rectangular_facade_tiles` | 0.56/0.72/0.46 MB | 1.74 MB | Building skins |
| `concrete` | `concrete` | — | ~1.6 MB | Curb / retaining |
| `metal` | `metal_plate` | — | ~1.5 MB | Industrial detail |
| **`brick`** | `brick_wall_001` | 0.57/0.30/0.12 MB | **0.95 MB** | Brick facades |
| **`plaster`** | `blue_plaster_wall` | 0.59/0.70/0.50 MB | **1.71 MB** | Painted plaster facades |
| **`tileFacade`** | `concrete_tile_facade` | 0.63/0.94/0.64 MB | **2.10 MB** | Modern tiled facades |
| **`brickPath`** | `brick_pavement` | 0.78/0.90/0.73 MB | **2.30 MB** | Garden / plaza paths |
| **`cobble`** | `cobblestone_pavement` | 0.81/0.61/0.44 MB | **1.77 MB** | Garden paving |

Bold rows are the additions introduced by the redesign to break the single-facade
look (architectural variety) and give the Garden district real ground.

## Models (glTF, 1k, with textures + .bin)

| Loader id | Poly Haven id | Size (gltf+bin+tex) | Target height | Use |
| --- | --- | --- | --- | --- |
| `streetLamp` | `street_lamp_01` | ~2.5 MB | 4.35 m | Street lighting |
| `bench` | `modular_street_seating` | ~3.4 MB | 0.92 m | Civic seating |
| `barrier` | `concrete_road_barrier` | ~2.6 MB | 0.82 m | Traffic control |
| `hydrant` | `fire_hydrant` | ~2.6 MB | 0.94 m | Street furniture |
| `planter` | `planter_box_01` | ~2.2 MB | 0.58 m | Plaza planters |
| **`planterGarden`** | `planter_box_02` | **2.35 MB** | 0.52 m | Garden planters |
| **`gardenBench`** | `painted_wooden_bench` | **1.90 MB** | 0.88 m | Garden seating |

## Rejected / deferred (with reason)

| Candidate | Measured 1k size | Decision |
| --- | --- | --- |
| `jacaranda_tree` | **204.7 MB** (.bin) | Rejected — far over budget |
| `island_tree_01` | **63.3 MB** (.bin) | Rejected — over budget |
| `modular_urban_apartments_facade` | 15.7 MB | Deferred — high-detail hero only if payload allows |
| `modular_factory_facade` | 16.8 MB | Deferred — as above |
| `modular_chainlink_fence` | 6.95 MB | Deferred — optional Innovation boundary |
| `metal_trash_can` | 4.76 MB | Deferred — optional street clutter |

Tree geometry is the dominant cost (a single 1k tree is 60–205 MB), which
confirms the decision to keep **procedural foliage** (instanced, cheap) rather
than photoreal tree models. See `world-art-direction.md`.

## Payload

`public/world` after Phase 1: **80 files, 48.6 MB**. Additions this phase:
daylight HDRI (1.45 MB) + 5 texture sets (~8.8 MB) + 2 models (~4.3 MB) ≈ 14.5 MB.

## Provenance

All items: Poly Haven (polyhaven.com), released under **CC0 1.0 Universal**
(public domain dedication). No attribution is legally required; the project
credits sources anyway in `docs/THIRD_PARTY_ASSETS.md` for transparency.
