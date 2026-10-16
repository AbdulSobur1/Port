# World Layout & Road-Network Design

This document is the design record for the redesigned world: how the five
districts map onto the four routes, how the road armature is designed *before*
the buildings, and how the ground is layered so nothing z-fights.

## 1. The five districts

The brief asks for five districts — Arrival, Work, Innovation, Garden, and
Landmark + Contact. They map onto the four routes and the in-world anchors like
this:

| District | Route / anchor | Layout field | Character |
| --- | --- | --- | --- |
| **Arrival** | `/` (hub) — spawn plaza | `hub` district `Arrival Plaza` | Lime-lit gateway, crosswalk to the plaza |
| **Work** | `/work` + hub project ring | work-city plots; hub `Work Quarter` | Boulevard of project plots around a monument |
| **Innovation** | Systems/skills anchor | hub `Innovation Yard` | Cyan systems quarter, east of the plaza |
| **Garden** | `/about` | about city + hub `Reflection Gardens` | Green, benches, planters, low walls |
| **Landmark + Contact** | `/contact` | contact city + hub `Landmark Commons` | Central monument; signal courtyard |

Districts are declared as `District[]` on each `WorldLayout` and rendered as soft
themed ground discs (`Districts` in `city.tsx`). They are **visual/thematic only**
— they never add colliders, so they cannot trap the vehicle.

## 2. Road network is designed before the buildings

The road armature is data, declared as `roads` (axis-aligned centre-lines) and
`rings` (roundabouts) on every layout. It is the spine the buildings, stations and
kerbs are placed against. The hub is a cardinal grid: two arterials crossing at
the plaza plus a secondary street each side, bounded by the perimeter wall.

Two arterials cross at (0,0) and six streets produce nine junctions — every one
is detected and rendered as a rounded pad (see `segIntersection` + `junction` in
`city.tsx`).

## 3. Junction, kerb and sidewalk system

`RoadNetwork` (city.tsx) renders one coherent system instead of loose quads:

| Element | Geometry | Layer (y) |
| --- | --- | --- |
| Road surface | plane per segment | `-0.075` |
| Centre line | plane on arterials | `-0.064` |
| Junction pad | 40-gon disc at each crossing | `-0.068` (rim `-0.059`) |
| Kerb | box `0.24 × 0.18`, both sides | centred `+0.03` |
| Sidewalk | box `0.60 × 0.14`, outboard of kerb | centred `+0.02` |
| Ring roundabout | annulus + lime/white edge rings | `-0.062` |

Each layer owns a distinct y, so **coplanar quads can never z-fight** at a
crossing (the earlier design drew every road at `y = -0.075` and overlapped them).

Kerbs are skipped on `lane`-kind roads so back lanes read as kerb-less.

## 4. One ground system, not five

Previously the ground was drawn by `MapPlane` + `showBase` + asset-layer asphalt
planes + `Roads` + `CitySkirt` + asset-layer pavement — five systems overlapping
(redundant overdraw, drift-prone). The redesign:

- `RoadNetwork` is the **canonical** surface owner (roads, rings, junctions, kerbs).
- The asset layer contributes only the **PBR pavement base** (`TexturedGround`),
  no duplicate road planes.
- `MapPlane` (`NEXT_PUBLIC_WORLD_MAP`) and `CitySkirt` remain as optional context
  under/around the designed city.

## 5. Architectural variety

Buildings keep their procedural massing (windows, spines, roof styles) but the
photoreal skin now cycles a four-material palette (`facade`, `tileFacade`,
`plaster`, `brick`) by building index, so a street no longer reads as one texture.

## 6. Non-driving access

Every destination remains reachable **on foot** from the arrival spawn via the
station ring and portal gates — the car is an option, not a gate. See the nav
hierarchy in `IMPLEMENTATION-REPORT.md`.
