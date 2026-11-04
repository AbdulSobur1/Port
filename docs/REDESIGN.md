# Redesign notes

## How the portfolio is organised
- **Five streets, one kind of work each** (real OpenStreetMap street names, kept unchanged):
  Adeniji Adele Road = Products, Oshodi Street = Client and team work, Glover Street = Training builds,
  Omidi Dum Street = Ideas and early drafts, Okepopo Street = About and contact.
- Every street has a colour **and** a shape (circle, square, triangle, diamond, hexagon), so colour is never the only cue.
- `lib/works.ts` is the single source of truth: streets, works, page stops, stop order. The 3D map, the phone journey,
  `/work`, `/work/[slug]`, the street guide and the search-engine text all read from it.

## Two experiences
- Desktop with a mouse (min-width 900px, hover, fine pointer): drivable 3D map, street guide, expanded street map.
- Everything else, and any browser without WebGL: a scroll journey (`components/journey/journey.tsx`), pure CSS 3D.
  No three.js is downloaded on phones.

## Adding or changing work
1. Edit `lib/works.ts` (a work, its district, and its position in `streetPlan`).
2. `pnpm geo:place` re-places every stop on its street (no PBF needed).
3. `pnpm verify`.

## The "Still to add" boxes
Each work lists `gaps`: things only the owner can supply (screenshots, links, dates). They render as dashed yellow
boxes. Set `NEXT_PUBLIC_SHOW_GAPS=0` in the production environment to hide them from visitors.

## Not re-runnable here
`scripts/extract-world-data.mjs` still places the old nine stops; the shipped world data was re-placed with
`scripts/place-streets.mjs`. Port the multi-street placement into the extractor before the next full extraction.
