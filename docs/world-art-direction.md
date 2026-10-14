# World art direction

## Thesis

The arrival hub is a **dusk-lit near-future trade city**: wet asphalt, pale
concrete, brushed metal, and a lime/cyan signage system glowing against a cool
teal fog. It should read as *designed and inhabited*, not as a grey placeholder
grid. The three district cities keep the same language but shift their light:
the Work District is a rainy night, Contact a cold snowy small-hours, About a
clear late morning.

## References

- **Blade Runner 2049** — monolithic slabs, atmospheric fog, signage as light,
  a single dominant warm/cool contrast pair.
- **Mirror's Edge** — clean white/grey surfaces used as negative space so the
  accent colour does all the talking.
- **Cyberpunk 2077 street level** — ordinary street furniture (hydrants, bins,
  barriers, benches) rendered with real materials, which is what makes a city
  feel lived-in.

## Palette

| Role | Token | Value |
| --- | --- | --- |
| Primary accent (brand) | lime | `#d8f851` |
| Secondary accent | cyan | `#6de0dd` |
| Base ink | ink | `#0b1415` |
| Concrete | paving | `#2b3835` → `concrete_pavement_02` |
| Road | asphalt | `#182322` → `asphalt_01` |
| Structure | concrete | `#101a19` → `concrete` |
| Metal | steel | `#384542` → `metal_plate` |
| Facade | cladding | per-building tint × `rectangular_facade_tiles` |

Accents stay reserved for *information*: stations, portals, the landmark,
window accents. Surfaces stay desaturated so the accents read.

## Lighting

- One key directional (sun) whose colour/position drifts with the city's hour.
- A cool hemisphere fill + low ambient so shadow sides aren't black.
- Two static point lights (teal + violet) to separate the plaza from the ring.
- **New:** an HDRI environment (`qwantani_dusk_1` by day, `satara_night` at
  night) at `environmentIntensity` 0.55, giving every PBR surface real
  reflections and contact ambient. Skipped on low-power devices.
- Emissive signage (`toneMapped={false}`) and additive `Glow` sprites carry the
  neon without post-processing.

## Materials

All surfaces use the Poly Haven PBR triplets: sRGB diffuse + linear `nor_gl`
normal + linear packed `arm` (AO/rough/metal). The same `arm` map feeds both
roughness and metalness, which is why the wet look reads correctly. Tiling is
applied by scaling each geometry's UVs to a fixed real-world tile (~4.5 m roads,
~3.2 m paving, ~2.4 m facade), so one shared material instance covers every
building in a city.

## Composition rules

1. **One landmark, one axis.** Every city has a single emblem at its centre; the
   roads and ring marks frame it rather than decorate the whole map evenly.
2. **Legibility over density.** Props are placed on sidewalks and in the corners
   of blocks, never in a lane — the driving line must always be obvious.
3. **Sunken detail.** Windows, sills and signs sit *proud* of the cladding, so
   the eye finds structure without texture noise.
4. **Blend by intent.** Real photographic props sit on real photographic
   surfaces, so the photoreal layer never fights a flat colour underneath.

## What was deliberately kept procedural

- **Trees** — Poly Haven trees are 12 MB+ each (9–12 texture sets); the instanced
  procedural trees cost nothing and match the signage style.
- **Buildings** — photoreal modular skyscrapers don't exist under a permissive
  licence; the parametric massing + PBR cladding is the honest compromise.
- **The player car** — bespoke to the physics rig and the brand.
- **Sky/weather/rain/snow** — already cheap, animated and on-brand.

## Acceptance criteria

- The world reads as photoreal at driving distance without dropping the brand
  accents (lime/cyan) or the fog mood.
- No surface is left as a flat untextured placeholder where a real material is
  available under CC0.
- Nothing added by the asset layer alters collision, driving feel or routing.
- On low-power devices the world still renders (IBL skipped, DPR reduced).
