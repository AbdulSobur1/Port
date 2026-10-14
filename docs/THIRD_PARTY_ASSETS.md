# Third-party assets

All assets in `public/world/` are **CC0 1.0** (public domain). No attribution is
legally required; credits are listed below as good practice. No CC BY-SA or
non-commercial assets are used, so the shipped build carries no obligations.

## Provenance

| Asset | Path | Source | Author(s) | License |
| --- | --- | --- | --- | --- |
| Street lamp | `public/world/models/street_lamp_01/` | [polyhaven.com/models/street_lamp_01](https://polyhaven.com/models/street_lamp_01) | Josh Dean | CC0 1.0 |
| Modular street seating | `public/world/models/modular_street_seating/` | [polyhaven.com/models/modular_street_seating](https://polyhaven.com/models/modular_street_seating) | Stuart Attenborrow | CC0 1.0 |
| Concrete road barrier | `public/world/models/concrete_road_barrier/` | [polyhaven.com/models/concrete_road_barrier](https://polyhaven.com/models/concrete_road_barrier) | Amal Kumar | CC0 1.0 |
| Fire hydrant | `public/world/models/fire_hydrant/` | [polyhaven.com/models/fire_hydrant](https://polyhaven.com/models/fire_hydrant) | Gonçalo Felício | CC0 1.0 |
| Planter box | `public/world/models/planter_box_01/` | [polyhaven.com/models/planter_box_01](https://polyhaven.com/models/planter_box_01) | James Ray Cock | CC0 1.0 |
| Asphalt | `public/world/materials/asphalt_01/` | [polyhaven.com/textures/asphalt_01](https://polyhaven.com/textures/asphalt_01) | Dario Barresi, Charlotte Baglioni | CC0 1.0 |
| Concrete pavement | `public/world/materials/concrete_pavement_02/` | [polyhaven.com/textures/concrete_pavement_02](https://polyhaven.com/textures/concrete_pavement_02) | Charlotte Baglioni | CC0 1.0 |
| Facade tiles | `public/world/materials/rectangular_facade_tiles/` | [polyhaven.com/textures/rectangular_facade_tiles](https://polyhaven.com/textures/rectangular_facade_tiles) | Charlotte Baglioni | CC0 1.0 |
| Concrete | `public/world/materials/concrete/` | [polyhaven.com/textures/concrete](https://polyhaven.com/textures/concrete) | Rob Tuytel | CC0 1.0 |
| Metal plate | `public/world/materials/metal_plate/` | [polyhaven.com/textures/metal_plate](https://polyhaven.com/textures/metal_plate) | Rob Tuytel | CC0 1.0 |
| Dusk HDRI | `public/world/environment/qwantani_dusk_1_1k.hdr` | [polyhaven.com/hdris/qwantani_dusk_1](https://polyhaven.com/hdri/qwantani_dusk_1) | Greg Zaal, Jarod Guest | CC0 1.0 |
| Night sky HDRI | `public/world/environment/satara_night_1k.hdr` | [polyhaven.com/hdris/satara_night](https://polyhaven.com/hdri/satara_night) | Greg Zaal | CC0 1.0 |

Resolution: all textures and HDRIs downloaded at 1K to keep the shipped payload
reasonable (~34 MB total). Upgrading to 2K/4K only requires re-downloading the
same ids via the Poly Haven file API (`https://api.polyhaven.com/files/{id}`).

## License text

CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>

> The person who associated a work with this deed has dedicated the work to the
> public domain by waiving all of their rights to the work worldwide under
> copyright law, including all related and neighboring rights, to the extent
> allowed by law. You can copy, modify, distribute and perform the work, even
> for commercial purposes, all without asking permission.

## Evaluated but not used

| Asset | Source | License | Why not |
| --- | --- | --- | --- |
| City Kit (Commercial) | Kenney | CC0 | Low-poly stylised; clashes with photoreal props |
| Downtown City Megakit / Cyberpunk Kit | Quaternius | CC0 | Same style mismatch |
| fir_tree_01, jacaranda_tree | Poly Haven | CC0 | 11.8 MB / 13.4 MB per tree — too heavy for mass planting |
| AmbientCG Asphalt033 / Road007 | ambientCG | CC0 | Viable alternative supplier; Poly Haven chosen for consistency |

## Notes on modification

Selected models are used unmodified except for runtime transforms (scale,
position, rotation) and material tinting applied in `components/world`. No file
in `public/world/` is edited on disk, which keeps checksums reproducible.
