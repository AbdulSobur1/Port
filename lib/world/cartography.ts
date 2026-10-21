/**
 * Cartography for the playable world.
 *
 * The map is not a second source of truth. Everything drawn here is built from
 * the same payloads the 3D scene, the route planner and the collision grid use:
 * `world.roads` (the curated drivable network), the building chunk footprints,
 * `world.mainStreet`, `world.stations`, `world.crossings` and `world.pois`.
 *
 * One transform converts world metres to canvas pixels, so a marker cannot
 * drift off its building and the car chevron cannot drift off the car. World
 * +Z is north; canvas +Y is south, hence the single sign flip in
 * `toScreen`/`toWorld`.
 */

import type { Building, RoadData, StationData, WorldData } from './types';

export type WorldRect = { minX: number; minZ: number; maxX: number; maxZ: number };
export type MapSize = { width: number; height: number };

/**
 * Visible window: world centre and pixels per world metre.
 *
 * `turn: 1` rotates the plan a quarter turn so the street runs down a portrait
 * viewport instead of being squeezed into a thin horizontal band. It is a true
 * rotation (not a mirror): world +X becomes screen up, world +Z becomes screen
 * right.
 */
export type MapView = { x: number; z: number; scale: number; turn?: 0 | 1 };

export const DEFAULT_MIN_SCALE = 0.12;
export const DEFAULT_MAX_SCALE = 9;

export function rectOfPoints(rects: WorldRect[]): WorldRect {
  const out = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const r of rects) {
    out.minX = Math.min(out.minX, r.minX);
    out.minZ = Math.min(out.minZ, r.minZ);
    out.maxX = Math.max(out.maxX, r.maxX);
    out.maxZ = Math.max(out.maxZ, r.maxZ);
  }
  return out;
}

export function rectOfPolyline(p: number[], pad = 0): WorldRect {
  const r = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (let i = 0; i < p.length; i += 2) {
    r.minX = Math.min(r.minX, p[i] - pad);
    r.maxX = Math.max(r.maxX, p[i] + pad);
    r.minZ = Math.min(r.minZ, p[i + 1] - pad);
    r.maxZ = Math.max(r.maxZ, p[i + 1] + pad);
  }
  return r;
}

export function expandRect(r: WorldRect, metres: number): WorldRect {
  return { minX: r.minX - metres, minZ: r.minZ - metres, maxX: r.maxX + metres, maxZ: r.maxZ + metres };
}

/** World point → canvas pixel. */
export function toScreen(view: MapView, size: MapSize, x: number, z: number): { x: number; y: number } {
  if (view.turn) {
    return {
      x: size.width / 2 + (z - view.z) * view.scale,
      y: size.height / 2 - (x - view.x) * view.scale,
    };
  }
  return {
    x: (x - view.x) * view.scale + size.width / 2,
    y: size.height / 2 - (z - view.z) * view.scale,
  };
}

/** Canvas pixel → world point (exact inverse of {@link toScreen}). */
export function toWorld(view: MapView, size: MapSize, px: number, py: number): { x: number; z: number } {
  if (view.turn) {
    return {
      x: (size.height / 2 - py) / view.scale + view.x,
      z: (px - size.width / 2) / view.scale + view.z,
    };
  }
  return {
    x: (px - size.width / 2) / view.scale + view.x,
    z: (size.height / 2 - py) / view.scale + view.z,
  };
}

/** Half-extents of the viewport in world metres, honouring the quarter turn. */
function worldHalfExtents(view: MapView, size: MapSize): { hx: number; hz: number } {
  return view.turn
    ? { hx: size.height / 2 / view.scale, hz: size.width / 2 / view.scale }
    : { hx: size.width / 2 / view.scale, hz: size.height / 2 / view.scale };
}

/** The world rectangle currently visible. */
export function viewRect(view: MapView, size: MapSize): WorldRect {
  const { hx, hz } = worldHalfExtents(view, size);
  return { minX: view.x - hx, maxX: view.x + hx, minZ: view.z - hz, maxZ: view.z + hz };
}

/** Centre + zoom that fits `rect` inside `size` with padding on every side. */
export function fitView(rect: WorldRect, size: MapSize, padding = 18, turn: 0 | 1 = 0): MapView {
  const availW = Math.max(40, size.width - padding * 2);
  const availH = Math.max(40, size.height - padding * 2);
  const width = Math.max(1, rect.maxX - rect.minX);
  const depth = Math.max(1, rect.maxZ - rect.minZ);
  const scale = turn
    ? Math.min(availH / width, availW / depth)
    : Math.min(availW / width, availH / depth);
  return {
    x: (rect.minX + rect.maxX) / 2,
    z: (rect.minZ + rect.maxZ) / 2,
    scale: Math.max(DEFAULT_MIN_SCALE, scale),
    turn,
  };
}

/**
 * Keep the view over the world instead of letting the user pan into empty
 * space. `slack` is the fraction of the viewport that may hang outside the
 * world, so a car near the edge is still readable.
 */
export function clampView(view: MapView, world: WorldRect, size: MapSize, slack = 0.18): MapView {
  const scale = Math.min(DEFAULT_MAX_SCALE, Math.max(DEFAULT_MIN_SCALE, view.scale));
  const { hx, hz } = worldHalfExtents({ ...view, scale }, size);
  const sx = hx * slack;
  const sz = hz * slack;
  return {
    ...view,
    scale,
    x: Math.min(world.maxX + hx - sx, Math.max(world.minX - hx + sx, view.x)),
    z: Math.min(world.maxZ + hz - sz, Math.max(world.minZ - hz + sz, view.z)),
  };
}

/** Zoom by a factor around a fixed screen anchor (cursor, or a pinch centre). */
export function zoomView(view: MapView, size: MapSize, factor: number, anchor?: { x: number; y: number }): MapView {
  const scale = Math.min(DEFAULT_MAX_SCALE, Math.max(DEFAULT_MIN_SCALE, view.scale * factor));
  if (!anchor) return { ...view, scale };
  const before = toWorld(view, size, anchor.x, anchor.y);
  const next = { ...view, scale };
  const after = toWorld(next, size, anchor.x, anchor.y);
  return { ...next, x: view.x + (before.x - after.x), z: view.z + (before.z - after.z) };
}

/**
 * Perpendicular-distance simplification (Douglas–Peucker). Road centrelines
 * carry survey points every couple of metres; at neighbourhood zoom most of
 * them land on the same pixel, and drawing them all is what made the old map
 * look noisy.
 */
export function simplify(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n < 3 || tolerance <= 0) return points;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const ax = points[first * 2];
    const az = points[first * 2 + 1];
    const bx = points[last * 2];
    const bz = points[last * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    let best = -1;
    let bestDist = 0;
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2];
      const pz = points[i * 2 + 1];
      const d = len < 1e-6
        ? Math.hypot(px - ax, pz - az)
        : Math.abs((px - ax) * dz - (pz - az) * dx) / len;
      if (d > bestDist) { bestDist = d; best = i; }
    }
    if (best !== -1 && bestDist > tolerance) {
      keep[best] = 1;
      stack.push([first, best], [best, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

/** Screen-space polyline points for a world polyline. */
export function screenPath(
  view: MapView,
  size: MapSize,
  points: number[],
  toleranceMetres = 0.4
): { x: number; y: number }[] {
  const simplified = simplify(points, toleranceMetres);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < simplified.length; i += 2) {
    out.push(toScreen(view, size, simplified[i], simplified[i + 1]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Map model                                                           */
/* ------------------------------------------------------------------ */

export type MapRoad = {
  id: number;
  /** Flat [x,z,…] centreline in world metres. */
  p: number[];
  /** Carriageway width, metres. */
  width: number;
  cls: string;
  name: string | null;
  /** True for the one continuous portfolio street. */
  main: boolean;
  oneway: -1 | 0 | 1;
};

export type MapModel = {
  roads: MapRoad[];
  buildings: Building[];
  stations: StationData[];
  crossings: { x: number; z: number; h: number; w: number }[];
  pois: { k: string; n: string; x: number; z: number }[];
  /** Land-cover rings, drawn beneath the streets so the plan has context. */
  green: number[][];
  water: number[][];
  sea: number[][];
  street: WorldData['mainStreet'] | null;
  /** Everything the map may draw, in world metres. */
  extent: WorldRect;
  /** The framing rect for the whole portfolio street (expanded map). */
  streetExtent: WorldRect;
};

const MIN_ROAD_WIDTH = 5.6;

function widen(road: RoadData): MapRoad {
  return {
    id: road.id,
    p: road.pts,
    width: Math.max(MIN_ROAD_WIDTH, road.width || 0),
    cls: road.cls,
    name: road.name,
    main: false,
    oneway: road.oneway,
  };
}

/**
 * Build the drawing model from the shipped world payload. `buildings` are the
 * footprints from every loaded chunk; the map filters them to `extent` itself.
 */
export function buildMapModel(world: WorldData, buildings: Building[] = []): MapModel {
  const streetName = world.mainStreet?.name ?? null;
  const roads = world.roads.filter((r) => r.pts.length >= 4).map(widen);
  if (streetName) {
    for (const road of roads) if (road.name === streetName) road.main = true;
  }

  const extent = world.meta.playable?.world
    ? {
        minX: world.meta.playable.world.minX,
        maxX: world.meta.playable.world.maxX,
        minZ: world.meta.playable.world.minZ,
        maxZ: world.meta.playable.world.maxZ,
      }
    : { ...world.meta.worldBounds };

  const streetParts = world.mainStreet
    ? [rectOfPolyline(world.mainStreet.p)]
    : world.stations.map((s) => ({ minX: s.x, maxX: s.x, minZ: s.z, maxZ: s.z }));
  const streetExtent = expandRect(rectOfPoints(streetParts), 62);

  return {
    roads,
    buildings,
    stations: world.stations,
    crossings: world.crossings,
    pois: world.pois,
    green: world.green ?? [],
    water: world.water ?? [],
    sea: world.sea ?? [],
    street: world.mainStreet ?? null,
    extent,
    streetExtent,
  };
}

/** Stations in street order (the artifact already ships them that way). */
export function orderedStations(stations: StationData[]): StationData[] {
  return [...stations].sort((a, b) => (a.streetOffset ?? 0) - (b.streetOffset ?? 0));
}

/** Point-in-polygon for station hit tests and placement validation. */
export function insidePolygon(x: number, z: number, p: number[]): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1];
    const xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polyline in metres. */
export function distanceToPolyline(px: number, pz: number, p: number[]): number {
  let best = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
    if (d < best) best = d;
  }
  return best;
}

/** Nearest station marker to a canvas position, within `radius` pixels. */
export function hitStation<T extends { x: number; z: number }>(
  view: MapView,
  size: MapSize,
  stations: T[],
  px: number,
  py: number,
  radius = 16
): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const station of stations) {
    const s = toScreen(view, size, station.x, station.z);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d <= bestD) { bestD = d; best = station; }
  }
  return best;
}

/** Off-screen pointer towards a world point, used by the compact minimap. */
export function edgePointer(
  view: MapView,
  size: MapSize,
  x: number,
  z: number,
  inset = 14
): { x: number; y: number; angle: number } {
  const p = toScreen(view, size, x, z);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const angle = Math.atan2(p.y - cy, p.x - cx);
  const halfW = size.width / 2 - inset;
  const halfH = size.height / 2 - inset;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : halfW / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : halfH / Math.abs(dy)
  );
  return { x: cx + dx * t, y: cy + dy * t, angle };
}
