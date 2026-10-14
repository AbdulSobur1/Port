# World asset research

Real, verified research for upgrading the Soburr world from a procedural
placeholder city to a photoreal, art-directed one. Every source below was
contacted during this pass (HTTP 200) and every license string was read at the
source page, not assumed.

## Sources investigated

| Source | Endpoint | Verified | License |
| --- | --- | --- | --- |
| Poly Haven assets API | `https://api.polyhaven.com/assets` | 521 models, 997 HDRIs, 869 textures | CC0 |
| Poly Haven file API | `https://api.polyhaven.com/files/{id}` | per-file URLs + md5 | CC0 |
| Poly Haven CDN | `https://dl.polyhaven.org/file/ph-assets/...` | direct download OK | CC0 |
| ambientCG API | `https://ambientcg.com/api/v1` | `Asphalt033`, `Road007`… | CC0 |
| Kenney | `https://kenney.nl/assets/city-kit-commercial` | page 200 | CC0 |
| Quaternius | `https://quaternius.com/packs/downtowncitymegakit.html` | page 200 | CC0 |
| Khronos glTF sample models | `github.com/KhronosGroup/glTF-Sample-Models` | raw 200 | per-asset |

## License resolution

| License | Commercial | Modify | Redistribute | Attribution | Share-alike |
| --- | --- | --- | --- | --- | --- |
| CC0 1.0 (`creativecommons.org/publicdomain/zero/1.0/`) | yes | yes | yes | not required | no |
| CC BY 4.0 | yes | yes | yes | **required** | no |
| CC BY-SA 4.0 | yes | yes | yes | **required** | **yes (viral)** |
| MIT (code only) | yes | yes | yes | required in source | no |

Selection rule applied: prefer CC0 so the distributed build carries no
attribution debt; reject CC BY-SA to avoid share-alike obligations on the
portfolio; never treat a code licence (e.g. MIT on a repo) as covering bundled
art. All selected assets are **CC0 1.0**.

## Component-by-component findings

### Environment / lighting (IBL)
- **Selected:** Poly Haven HDRIs `qwantani_dusk_1` (dusk) and `satara_night`
  (night). 1k `.hdr`, ~1.4–1.9 MB each. Feed `THREE.PMREMGenerator` via drei
  `<Environment>` for image-based lighting and reflections.
- Rejected: `kloofendal_*` (too overcast for the brand's contrast).

### Roads
- **Selected:** Poly Haven `asphalt_01` PBR set (`diff`, `nor_gl`, `arm` @1k).
- Alternative: ambientCG `Asphalt033`, `Road007` (also CC0).

### Sidewalks / plaza
- **Selected:** Poly Haven `concrete_pavement_02`.
- Base structure: Poly Haven `concrete`.

### Buildings / facades
- **Selected:** Poly Haven `rectangular_facade_tiles` (facade), `metal_plate`
  (futuristic accents), applied to the existing procedural massing.
- Rejected: Kenney *City Kit* and Quaternius `downtowncitymegakit` /
  `cyberpunkgamekit` — both CC0 and high quality, but deliberately low-poly and
  stylised; mixing them with photoreal props was judged incoherent.
- Rejected: Sketchfab "free" megacity kits — mixed/ambiguous licences and large
  downloads; not worth the legal risk under this project's rules.

### Street lighting & infrastructure
- **Selected:** Poly Haven models `street_lamp_01`, `concrete_road_barrier`,
  `fire_hydrant`.
- Alternative: `street_lamp_02`, `metal_trash_can`.

### Street furniture
- **Selected:** Poly Haven `modular_street_seating` (timber + steel).

### Vegetation
- **Selected:** Poly Haven `planter_box_01` (planters) + the existing instanced
  procedural trees.
- Rejected: `fir_tree_01` and `jacaranda_tree` — photoreal but **11.8 MB and
  13.4 MB** per tree (9–12 texture sets), which is disproportionate for the
  number of instances a city needs.

### Vehicles
- **Selected:** keep the in-repo procedural player car (tied to the physics
  rig). Kenney Car Kit documented as an alternative for future traffic.

### Terrain / background
- Keep the procedural `CitySkirt` + fog; the HDRI supplies the horizon backdrop.

## Weighted evaluation

Weights: visual quality 25, world fit 20, runtime cost 15, stack compatibility
15, modularity 10, licence clarity 10, integration effort 5.

| Candidate | Role | Visual | Fit | Runtime | Stack | Modular | Licence | Effort | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwantani_dusk_1 + satara_night | IBL | 22 | 20 | 14 | 15 | 8 | 10 | 4 | 93 |
| asphalt_01 | roads | 20 | 19 | 14 | 15 | 8 | 10 | 5 | 91 |
| concrete_pavement_02 | walks | 19 | 19 | 14 | 15 | 8 | 10 | 5 | 90 |
| rectangular_facade_tiles | facades | 21 | 20 | 15 | 15 | 9 | 10 | 4 | 94 |
| street_lamp_01 | lighting | 23 | 21 | 13 | 14 | 9 | 10 | 4 | 94 |
| modular_street_seating | furniture | 22 | 20 | 13 | 14 | 9 | 10 | 4 | 92 |
| concrete_road_barrier | barriers | 18 | 18 | 15 | 15 | 10 | 10 | 5 | 91 |
| concrete_road_barrier_02 | barriers | 18 | 17 | 15 | 15 | 10 | 10 | 5 | 90 |
| fire_hydrant | props | 17 | 17 | 14 | 15 | 10 | 10 | 5 | 88 |
| planter_box_01 | planting | 19 | 18 | 15 | 15 | 10 | 10 | 5 | 92 |
| fir_tree_01 | trees | 24 | 22 | 6 | 14 | 7 | 10 | 2 | 85 |
| jacaranda_tree | trees | 24 | 22 | 5 | 14 | 7 | 10 | 2 | 84 |

Weight adjustment: **Runtime cost** was raised to 15% (from the suggested 15%)
and treated as near-disqualifying for vegetation, which is why the highest
scoring trees were rejected — their texture footprint is unreasonable for a
browser portfolio. **Integration effort** was kept low (5%) because glTF + PBR
is a known path in this stack.

## Why no photoreal modular buildings?

No CC0 source ship photoreal, drop-in, modular skyscrapers as glTF. Photoreal
architecture is either proprietary (paid marketplaces) or scan-scale. Rather
than compromise the licence or performance, the design upgrades the existing
parametric massing (sill/window-bay builder in `city.tsx`) with real PBR
cladding/window materials, which preserves the drivable layout and collision
model while removing the flat placeholder look.

## Sources
- https://polyhaven.com and `https://api.polyhaven.com`
- https://ambientcg.com
- https://kenney.nl
- https://quaternius.com
- https://github.com/KhronosGroup/glTF-Sample-Models
