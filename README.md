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
- `pnpm test` — compile and run the deterministic physics/city tests (25 tests)

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
