# Soburr — Interactive 3D Portfolio

A Next.js App Router portfolio built with React, TypeScript, Three.js, and React Three Fiber. The landing experience is a drivable 3D world split into four cities; every project is also available as an accessible editorial page.

## Requirements

- Node.js 20.9 or newer
- [pnpm](https://pnpm.io) 10 or newer (this repo is pnpm-managed; do not use `npm install`, which would ignore `pnpm-lock.yaml`)

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Scripts

- `pnpm dev` — start the development server
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — compile and run the deterministic physics, city, and coordinate-system tests (34 tests)

## Worlds

The landing page is one canvas with four drivable cities, linked by portal gates and the top navigation:

- `/` — **Hub**: spawn point, orientation, and city gates
- `/work` — **Work city**: every project is a station; the archive and case studies live at `/work/archive` and `/work/[slug]`
- `/about` — **Gardens**
- `/contact` — **Signal**

## Controls

- `W` / `Arrow Up`: accelerate
- `S` / `Arrow Down`: reverse
- `A` / `Arrow Left`: steer left
- `D` / `Arrow Right`: steer right
- `Space`: brake
- `E`: inspect the nearest station
- `M`: toggle the destination map
- `H`: horn
- `R`: reset vehicle and navigation
- `Escape`: close panels and release drive inputs

Touch controls are provided for coarse-pointer devices.

## The real-world map and the coordinate system

The ground is a **real OpenStreetMap view** rendered by [MapLibre GL JS](https://maplibre.org/) into an offscreen canvas and used as a texture under the designed city — so the world sits on genuine geography rather than a decorative grid.

All geometry shares one documented coordinate system, defined in `components/world/geo.ts`:

- **World space** is right-handed and measured in metres: `+X` = east, `+Z` = north, `+Y` = up, with `(0, 0)` at the city centre.
- `(0, 0)` is anchored to a real WGS84 point, `WORLD_ORIGIN`. The default is central Abuja, Nigeria.
- `worldToLatLng` / `latLngToWorld` convert with an equirectangular projection that is accurate to well under a centimetre across a city block; `metersPerDegreeLat/Lng` use the full WGS84 series expansion.
- The projection is unit-tested in `tests/geo.test.ts`.

If MapLibre, the network, or WebGL is unavailable, the map degrades gracefully to the fully procedural ground — the city is never left without a floor.

### Map configuration

Copy `.env.example` to `.env.local` to override the defaults:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_WORLD_MAP` | `off` disables the real map and keeps the procedural ground |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Your own MapLibre style URL (vector or raster); overrides the keyless OSM raster |
| `NEXT_PUBLIC_WORLD_ORIGIN` | `"lat,lng"` — the real-world point world `(0,0)` projects onto |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin used for metadata and `sitemap.xml` |

Map data © OpenStreetMap contributors.

## Rendering quality

Rendering starts conservatively on touch-first devices and when reduced motion is requested. Runtime frame sampling lowers the pixel ratio when performance declines and restores it when performance recovers. The scene keeps a small, fixed set of dynamic lights; emissive materials and additive glow sprites carry the neon look. Append `?debug=1` to any world URL for a live FPS / draw-call / GPU readout.

## Structure

- `app/` — App Router pages and global styles
- `app/work/` — project index, archive, and project detail routes
- `components/world/` — the drivable world: physics, simulation, city renderer, atmosphere, audio, HUD, and camera
- `components/work/` — editorial project components
- `lib/projects.ts` — the project dataset
- `tests/` — deterministic physics and city-integrity tests

## Content

Project descriptions and technology labels come from `lib/projects.ts`. Keep claims and external links evidence-based. Conceptual artwork on the editorial pages is generated with CSS as a visual treatment; it is not a screenshot of a deployed product.

## Deployment

Deployed on Vercel, which builds with pnpm from `pnpm-lock.yaml`. Run `pnpm install`, `pnpm typecheck`, and `pnpm build` locally before pushing.
