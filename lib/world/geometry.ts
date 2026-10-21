/**
 * Mesh builders. Everything here works in world metres (the same coordinates
 * the graph, the map and the vehicle use), so a road ribbon, the collision
 * footprint and the car's path are the same geometry expressed three ways.
 *
 * Output is plain arrays (positions/normals/uvs/colors) that the R3F
 * components wrap in BufferGeometry. Triangles are non-indexed on purpose:
 * flat-shaded walls and asphalt need per-face normals, and the vertex counts
 * are small enough that simplicity beats saving a few hundred kilobytes.
 */

import * as THREE from 'three';
import type { Building, RoadData } from './types';

export type MeshArrays = {
  position: number[];
  normal: number[];
  uv: number[];
  color: number[];
};

export function emptyArrays(): MeshArrays {
  return { position: [], normal: [], uv: [], color: [] };
}

export function triangleCount(m: MeshArrays): number {
  return m.position.length / 9;
}

/** Push one triangle with a flat normal (computed if not provided). */
function pushTri(
  m: MeshArrays,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  color: [number, number, number],
  uvs: [[number, number], [number, number], [number, number]],
  normal?: [number, number, number]
) {
  let nx = 0, ny = 1, nz = 0;
  if (normal) {
    [nx, ny, nz] = normal;
  } else {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    nx = e1y * e2z - e1z * e2y;
    ny = e1z * e2x - e1x * e2z;
    nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
  }
  m.position.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  m.normal.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  m.uv.push(uvs[0][0], uvs[0][1], uvs[1][0], uvs[1][1], uvs[2][0], uvs[2][1]);
  m.color.push(color[0], color[1], color[2], color[0], color[1], color[2], color[0], color[1], color[2]);
}

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

export type RoadMeshes = {
  asphalt: MeshArrays;
  sidewalk: MeshArrays;
  curb: MeshArrays;
  markings: MeshArrays;
};

const ROAD_TINT: Record<string, [number, number, number]> = {
  motorway: [0.2, 0.21, 0.2],
  trunk: [0.21, 0.215, 0.205],
  primary: [0.235, 0.24, 0.235],
  secondary: [0.24, 0.245, 0.24],
  tertiary: [0.245, 0.25, 0.245],
  residential: [0.255, 0.26, 0.255],
  service: [0.27, 0.27, 0.262],
  living_street: [0.28, 0.275, 0.26],
  unclassified: [0.26, 0.26, 0.252],
  pedestrian: [0.3, 0.29, 0.27],
  footway: [0.28, 0.28, 0.27],
  path: [0.27, 0.27, 0.25],
  cycleway: [0.26, 0.28, 0.26],
  track: [0.3, 0.28, 0.24],
  steps: [0.28, 0.28, 0.27],
};

const WALKABLE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian']);

/**
 * Road tints multiply the asphalt albedo, so they are deliberately light: an
 * albedo below ~0.2 turns mid-morning Lagos asphalt into near-black tar once
 * tone mapping is applied. These track measured dry-asphalt reflectance (a
 * 0.35–0.45 grey in daylight) rather than a stylistic mood.
 */
const ROAD_TINT_SCALE = 1.85;

/** Miter normals for a polyline so ribbons keep a constant width at bends. */
function polylineNormals(pts: number[]): { nx: number; nz: number; scale: number }[] {
  const n = pts.length / 2;
  const segN: { nx: number; nz: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[2 * i + 2] - pts[2 * i];
    const dz = pts[2 * i + 3] - pts[2 * i + 1];
    const len = Math.hypot(dx, dz) || 1;
    segN.push({ nx: -dz / len, nz: dx / len });
  }
  const out: { nx: number; nz: number; scale: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)];
    const b = segN[Math.min(segN.length - 1, i)];
    let nx = a.nx + b.nx, nz = a.nz + b.nz;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    const dot = nx * a.nx + nz * a.nz;
    const scale = 1 / Math.max(0.55, dot);
    out.push({ nx, nz, scale });
  }
  return out;
}

/** Strip along a polyline at a given offset from the centreline. */
function ribbon(
  m: MeshArrays,
  pts: number[],
  offset: number,
  halfWidth: number,
  y: number,
  color: [number, number, number],
  uvScale = 0.12
) {
  const normals = polylineNormals(pts);
  let dist = 0;
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const x0 = pts[2 * i], z0 = pts[2 * i + 1];
    const x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
    const a0 = normals[i], a1 = normals[i + 1];
    const segLen = Math.hypot(x1 - x0, z1 - z0);
    if (segLen < 0.02) continue;

    const ax = x0 + a0.nx * (offset - halfWidth) * a0.scale;
    const az = z0 + a0.nz * (offset - halfWidth) * a0.scale;
    const bx = x0 + a0.nx * (offset + halfWidth) * a0.scale;
    const bz = z0 + a0.nz * (offset + halfWidth) * a0.scale;
    const cx = x1 + a1.nx * (offset + halfWidth) * a1.scale;
    const cz = z1 + a1.nz * (offset + halfWidth) * a1.scale;
    const dx = x1 + a1.nx * (offset - halfWidth) * a1.scale;
    const dz = z1 + a1.nz * (offset - halfWidth) * a1.scale;

    const v0 = dist * uvScale;
    const v1 = (dist + segLen) * uvScale;
    const u0 = 0;
    const u1 = halfWidth * 2 * uvScale;
    // Winding: counter-clockwise seen from above → +Y normal.
    pushTri(m, ax, y, az, bx, y, bz, cx, y, cz, color, [[u0, v0], [u1, v0], [u1, v1]], [0, 1, 0]);
    pushTri(m, ax, y, az, cx, y, cz, dx, y, dz, color, [[u0, v0], [u1, v1], [u0, v1]], [0, 1, 0]);
    dist += segLen;
  }
}

/** Vertical curb face along a polyline. */
function curbFace(m: MeshArrays, pts: number[], offset: number, y0: number, y1: number, color: [number, number, number]) {
  const normals = polylineNormals(pts);
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const x0 = pts[2 * i], z0 = pts[2 * i + 1];
    const x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
    const a0 = normals[i], a1 = normals[i + 1];
    const ax = x0 + a0.nx * offset * a0.scale;
    const az = z0 + a0.nz * offset * a0.scale;
    const bx = x1 + a1.nx * offset * a1.scale;
    const bz = z1 + a1.nz * offset * a1.scale;
    if (Math.hypot(bx - ax, bz - az) < 0.02) continue;
    const nx = a0.nx * Math.sign(offset), nz = a0.nz * Math.sign(offset);
    pushTri(m, ax, y0, az, bx, y0, bz, bx, y1, bz, color, [[0, 0], [1, 0], [1, 1]], [nx, 0, nz]);
    pushTri(m, ax, y0, az, bx, y1, bz, ax, y1, az, color, [[0, 0], [1, 1], [0, 1]], [nx, 0, nz]);
  }
}

/**
 * Dashed centre line for the road classes that have markings.
 *
 * Dashes sit on an absolute grid measured along the polyline, so each dash is
 * derived from its index instead of from a floating-point cursor. The earlier
 * cursor form could advance by ~1e-13 per iteration when a dash boundary fell
 * within rounding distance of the cursor, which pushed triangles until V8 threw
 * `RangeError: Invalid array length` (±4.29e9 elements) and took the renderer
 * down with it. Indexing makes every iteration advance the grid by one.
 */
function dashes(m: MeshArrays, pts: number[], y: number, halfWidth: number, color: [number, number, number]) {
  const dash = 3.2;
  const gap = 5.2;
  const period = dash + gap;
  /** Dashes shorter than this are sub-pixel clutter at street level. */
  const minDash = 0.4;
  let travelled = 0;

  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const x0 = pts[2 * i], z0 = pts[2 * i + 1];
    const x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
    const dx = x1 - x0, dz = z1 - z0;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.01) continue;
    const ux = dx / segLen, uz = dz / segLen;
    const nx = -uz, nz = ux;
    const segEnd = travelled + segLen;

    for (let index = Math.floor(travelled / period); index * period < segEnd; index++) {
      const from = Math.max(index * period, travelled);
      const to = Math.min(index * period + dash, segEnd);
      if (to - from < minDash) continue;
      const a = from - travelled;
      const b = to - travelled;
      const sx = x0 + ux * a, sz = z0 + uz * a;
      const ex = x0 + ux * b, ez = z0 + uz * b;
      const ax = sx + nx * halfWidth, az = sz + nz * halfWidth;
      const bx = sx - nx * halfWidth, bz = sz - nz * halfWidth;
      const cx = ex - nx * halfWidth, cz = ez - nz * halfWidth;
      const dxp = ex + nx * halfWidth, dzp = ez + nz * halfWidth;
      pushTri(m, ax, y, az, bx, y, bz, cx, y, cz, color, [[0, 0], [1, 0], [1, 1]], [0, 1, 0]);
      pushTri(m, ax, y, az, cx, y, cz, dxp, y, dzp, color, [[0, 0], [1, 1], [0, 1]], [0, 1, 0]);
    }
    travelled = segEnd;
  }
}

export function buildRoadMeshes(
  roads: RoadData[],
  crossings: { x: number; z: number; h: number; w: number }[] = [],
  mainStreetName?: string
): RoadMeshes {
  const asphalt = emptyArrays();
  const sidewalk = emptyArrays();
  const curb = emptyArrays();
  const markings = emptyArrays();

  for (const road of roads) {
    if (road.pts.length < 4) continue;
    const base = ROAD_TINT[road.cls] ?? ROAD_TINT.residential;
    const tint: [number, number, number] = [
      Math.min(1, base[0] * ROAD_TINT_SCALE),
      Math.min(1, base[1] * ROAD_TINT_SCALE),
      Math.min(1, base[2] * ROAD_TINT_SCALE),
    ];
    const half = road.width / 2;
    const isBridge = road.bridge;

    // Paint a wider shoulder first: cheaper than a full casing pass and it
    // gives intersections a readable edge.
    ribbon(asphalt, road.pts, 0, half + 0.35, isBridge ? 0.28 : 0.055, [tint[0] * 0.55, tint[1] * 0.55, tint[2] * 0.55], 0.08);
    ribbon(asphalt, road.pts, 0, half, isBridge ? 0.32 : 0.07, tint, 0.1);

    if (!isBridge && WALKABLE.has(road.cls)) {
      const walk = road.cls === 'service' || road.cls === 'living_street' ? 1.1 : 1.9;
      for (const side of [-1, 1]) {
        ribbon(sidewalk, road.pts, side * (half + walk / 2 + 0.18), walk / 2, 0.14, [0.82, 0.8, 0.76], 0.09);
        curbFace(curb, road.pts, side * (half + 0.18), 0.06, 0.16, [0.88, 0.86, 0.82]);
      }
    }

    // The one main street gets lane markings even where OSM classifies it as
    // `unclassified`: it is the boulevard every project sits on, and a wide
    // unmarked carriageway reads as a car park rather than a street.
    if (
      ['primary', 'secondary', 'tertiary', 'trunk', 'motorway'].includes(road.cls) ||
      (mainStreetName && road.name === mainStreetName)
    ) {
      dashes(markings, road.pts, isBridge ? 0.34 : 0.085, 0.09, [0.82, 0.82, 0.76]);
    }
  }

  // Zebra crossings from real OSM `highway=crossing` nodes, oriented by the
  // road they snapped to.
  for (const c of crossings) {
    const ux = Math.sin(c.h), uz = Math.cos(c.h);   // along the road
    const nx = Math.cos(c.h), nz = -Math.sin(c.h);  // across the road
    const halfSpan = Math.max(2.2, c.w * 0.36);
    const bars = 5;
    for (let i = 0; i < bars; i++) {
      const along = (i - (bars - 1) / 2) * 0.95;
      const cx = c.x + ux * along;
      const cz = c.z + uz * along;
      const hw = 0.26;
      const ax = cx - ux * hw, az = cz - uz * hw;
      const bx = cx + ux * hw, bz = cz + uz * hw;
      const ex = nx * halfSpan, ez = nz * halfSpan;
      pushTri(markings, ax + ex, 0.088, az + ez, bx + ex, 0.088, bz + ez, bx - ex, 0.088, bz - ez,
        [0.86, 0.86, 0.8], [[0, 0], [1, 0], [1, 1]], [0, 1, 0]);
      pushTri(markings, ax + ex, 0.088, az + ez, bx - ex, 0.088, bz - ez, ax - ex, 0.088, az - ez,
        [0.86, 0.86, 0.8], [[0, 0], [1, 1], [0, 1]], [0, 1, 0]);
    }
  }

  return { asphalt, sidewalk, curb, markings };
}

/**
 * Centreline dashes for the one main street.
 *
 * Drawn from the `mainStreet` polyline rather than from guessed road names, so
 * the line follows the exact same geometry as the map overlay and the route
 * graph. It is separate from the per-road markings because OSM classifies much
 * of Adeniji Adele Road as `unclassified`, and a boulevard without a lane line
 * reads as a car park.
 */
export function buildMainStreetMarkings(p: number[]): MeshArrays {
  const m = emptyArrays();
  if (p.length >= 4) dashes(m, p, 0.092, 0.09, [0.87, 0.87, 0.81]);
  return m;
}

/** Glowing strip under the car showing the exact route the autopilot follows. */
export function buildRouteRibbon(pts: number[], width = 1.5): MeshArrays {
  const m = emptyArrays();
  if (pts.length < 4) return m;
  const normals = polylineNormals(pts);
  const color: [number, number, number] = [0.78, 0.95, 0.32];
  const half = width / 2;
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const x0 = pts[2 * i], z0 = pts[2 * i + 1];
    const x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
    const a0 = normals[i], a1 = normals[i + 1];
    if (Math.hypot(x1 - x0, z1 - z0) < 0.05) continue;
    const ax = x0 + a0.nx * half * a0.scale;
    const az = z0 + a0.nz * half * a0.scale;
    const bx = x0 - a0.nx * half * a0.scale;
    const bz = z0 - a0.nz * half * a0.scale;
    const cx = x1 - a1.nx * half * a1.scale;
    const cz = z1 - a1.nz * half * a1.scale;
    const dx = x1 + a1.nx * half * a1.scale;
    const dz = z1 + a1.nz * half * a1.scale;
    pushTri(m, ax, 0.12, az, bx, 0.12, bz, cx, 0.12, cz, color, [[0, 0], [1, 0], [1, 1]], [0, 1, 0]);
    pushTri(m, ax, 0.12, az, cx, 0.12, cz, dx, 0.12, dz, color, [[0, 0], [1, 1], [0, 1]], [0, 1, 0]);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export type BuildingMeshes = {
  walls: MeshArrays;
  /** Curtain-wall storeys for towers, drawn with a glazed material. */
  glass: MeshArrays;
  /** Cornices, parapets, balconies, awnings and verandah posts. */
  trim: MeshArrays;
  roofs: MeshArrays;
  clutter: MeshArrays;
};

/** Deterministic 0..1 from a number, so facades are stable between renders. */
function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const FACADES: [number, number, number][] = [
  [0.82, 0.7, 0.49], // ochre
  [0.9, 0.84, 0.68], // cream
  [0.7, 0.45, 0.32], // terracotta
  [0.63, 0.71, 0.61], // faded mint
  [0.55, 0.59, 0.57], // grey concrete
  [0.88, 0.78, 0.48], // pale yellow
  [0.73, 0.55, 0.48], // dusty rose
  [0.77, 0.68, 0.58], // weathered stone
];

const ROOF_TINTS: [number, number, number][] = [
  [0.35, 0.32, 0.29],
  [0.47, 0.27, 0.18],
  [0.25, 0.29, 0.27],
  [0.55, 0.43, 0.3],
  [0.4, 0.36, 0.31],
];

const FLOOR_H = 3.3;
const UV_TILE_W = 7.2;

const AWNINGS: [number, number, number][] = [
  [0.58, 0.22, 0.16],
  [0.22, 0.36, 0.27],
  [0.66, 0.49, 0.22],
  [0.24, 0.3, 0.4],
];

type Edge = {
  x0: number; z0: number; x1: number; z1: number;
  nx: number; nz: number; len: number;
};

/**
 * A prism that follows a footprint edge: parapets, balcony slabs, railings,
 * shop awnings and verandahs. Everything is outward from the façade, so the
 * collision box (which stays the plain footprint) is never silently widened.
 */
function slab(
  m: MeshArrays,
  e: Edge,
  y: number,
  height: number,
  depth: number,
  color: [number, number, number]
) {
  if (height <= 0 || depth <= 0) return;
  const ax = e.x0, az = e.z0;
  const bx = e.x1, bz = e.z1;
  const cx = e.x1 + e.nx * depth, cz = e.z1 + e.nz * depth;
  const dx = e.x0 + e.nx * depth, dz = e.z0 + e.nz * depth;
  const y1 = y + height;
  const uv: [[number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1]];
  // top (counter-clockwise seen from +Y)
  pushTri(m, ax, y1, az, cx, y1, cz, dx, y1, dz, color, uv, [0, 1, 0]);
  pushTri(m, ax, y1, az, bx, y1, bz, cx, y1, cz, color, uv, [0, 1, 0]);
  // outer face
  pushTri(m, dx, y, dz, dx, y1, dz, cx, y1, cz, color, uv, [e.nx, 0, e.nz]);
  pushTri(m, dx, y, dz, cx, y1, cz, cx, y, cz, color, uv, [e.nx, 0, e.nz]);
  // ends (small, but they stop a balcony reading as a paper plane)
  pushTri(m, ax, y, az, dx, y, dz, dx, y1, dz, color, uv, [-e.nz, 0, e.nx]);
  pushTri(m, ax, y, az, dx, y1, dz, ax, y1, az, color, uv, [-e.nz, 0, e.nx]);
  pushTri(m, bx, y, bz, cx, y, cz, cx, y1, cz, color, uv, [e.nz, 0, -e.nx]);
  pushTri(m, bx, y, bz, cx, y1, cz, bx, y1, bz, color, uv, [e.nz, 0, -e.nx]);
}

/**
 * Buildings are classified from their surveyed height and footprint area into
 * four architectural roles, then detailed accordingly. The point is silhouette
 * and street-level character, not photogrammetry: a two-storey compound house
 * gets a hipped roof and verandah, a shop gets awnings and a parapet, an
 * apartment block gets balconies and a water tank, and a tower gets a concrete
 * podium with a glazed shaft and a crown.
 */
export function buildBuildingMeshes(buildings: Building[]): BuildingMeshes {
  const walls = emptyArrays();
  const glass = emptyArrays();
  const trim = emptyArrays();
  const roofs = emptyArrays();
  const clutter = emptyArrays();

  for (const building of buildings) {
    const p = building.p;
    const n = p.length / 2;
    if (n < 3) continue;
    const h = Math.max(2.6, Math.min(140, building.h));
    const seed = Math.round((p[0] + p[1] * 13) * 7);
    const facade = FACADES[Math.floor(hash01(seed) * FACADES.length)];
    const roofTint = ROOF_TINTS[Math.floor(hash01(seed + 99) * ROOF_TINTS.length)];
    const baseTint: [number, number, number] = [facade[0] * 0.55, facade[1] * 0.52, facade[2] * 0.5];

    // Area (shoelace) and centroid: both are used to choose a typology and to
    // place details that must stay inside the surveyed footprint.
    let area2 = 0;
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area2 += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
      cx += p[2 * i]; cz += p[2 * i + 1];
    }
    const area = Math.abs(area2) / 2;
    cx /= n; cz /= n;

    const house = h <= 7.4 && area <= 300;
    const shop = !house && h < 15;
    const apartment = !house && !shop && h < 17.5;
    const tower = !apartment && !shop && !house;
    const podiumH = tower ? Math.min(9, h * 0.3) : 0;
    const glassTint: [number, number, number] = [0.42, 0.5, 0.52];

    const edges: Edge[] = [];
    let perimeter = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = p[2 * i], z0 = p[2 * i + 1];
      const x1 = p[2 * j], z1 = p[2 * j + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      const nx = dz / len, nz = -dx / len; // outward for CCW rings
      const edge: Edge = { x0, z0, x1, z1, nx, nz, len };
      edges.push(edge);

      const u0 = perimeter / UV_TILE_W;
      const u1 = (perimeter + len) / UV_TILE_W;
      perimeter += len;
      const vPodium = podiumH / FLOOR_H;
      const vTop = h / FLOOR_H;

      if (tower && podiumH > 0) {
        pushTri(walls, x0, 0, z0, x1, 0, z1, x1, podiumH, z1, baseTint, [[u0, 0], [u1, 0], [u1, vPodium]], [nx, 0, nz]);
        pushTri(walls, x0, 0, z0, x1, podiumH, z1, x0, podiumH, z0, baseTint, [[u0, 0], [u1, vPodium], [u0, vPodium]], [nx, 0, nz]);
        // Slim concrete corner piers break up an otherwise unbroken glass box.
        pushTri(glass, x0, podiumH, z0, x1, podiumH, z1, x1, h, z1, glassTint, [[u0, 0], [u1, 0], [u1, (h - podiumH) / 4]], [nx, 0, nz]);
        pushTri(glass, x0, podiumH, z0, x1, h, z1, x0, h, z0, glassTint, [[u0, 0], [u1, (h - podiumH) / 4], [u0, (h - podiumH) / 4]], [nx, 0, nz]);
      } else {
        pushTri(walls, x0, 0, z0, x1, 0, z1, x1, h, z1, facade, [[u0, 0], [u1, 0], [u1, vTop]], [nx, 0, nz]);
        pushTri(walls, x0, 0, z0, x1, h, z1, x0, h, z0, facade, [[u0, 0], [u1, vTop], [u0, vTop]], [nx, 0, nz]);
      }
    }

    // Roof: triangulate the footprint in plan view.
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i], p[2 * i + 1]));
    let faces: number[][] = [];
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      faces = [];
    }
    for (const f of faces) {
      const a = contour[f[0]], b = contour[f[1]], c = contour[f[2]];
      pushTri(
        roofs,
        a.x, h + 0.02, a.y,
        b.x, h + 0.02, b.y,
        c.x, h + 0.02, c.y,
        roofTint, [[0, 0], [1, 0], [1, 1]], [0, 1, 0]
      );
    }

    const longest = edges.reduce<Edge | null>((best, e) => (!best || e.len > best.len ? e : best), null);

    if (house) {
      // Hipped roof with a real overhang: the single strongest silhouette cue
      // against the old "extruded cube" look at street level.
      const rise = 1.6 + hash01(seed + 3) * 1.3;
      for (const e of edges) {
        const ex0 = e.x0 + e.nx * 0.38, ez0 = e.z0 + e.nz * 0.38;
        const ex1 = e.x1 + e.nx * 0.38, ez1 = e.z1 + e.nz * 0.38;
        pushTri(roofs, ex1, h, ez1, ex0, h, ez0, cx, h + rise, cz,
          [roofTint[0] * 0.86, roofTint[1] * 0.72, roofTint[2] * 0.6],
          [[0, 0], [1, 0], [0.5, 1]]);
      }
      // Verandah on the street-facing long edge.
      if (longest && longest.len > 5 && longest.len < 16) {
        slab(trim, longest, 2.75, 0.16, 1.35, [0.42, 0.38, 0.31]);
        for (const t of [0.14, 0.5, 0.86]) {
          const px = longest.x0 + (longest.x1 - longest.x0) * t + longest.nx * 1.18;
          const pz = longest.z0 + (longest.z1 - longest.z0) * t + longest.nz * 1.18;
          box(trim, px, 0, pz, 0.14, 2.75, 0.14, [0.38, 0.34, 0.28]);
        }
      }
    } else {
      // Flat roofs get a parapet; shops and apartments also get a cornice band.
      for (const e of edges) {
        slab(trim, e, h, 0.52, 0.2, [facade[0] * 0.84, facade[1] * 0.84, facade[2] * 0.82]);
      }
      if (!tower) {
        for (const e of edges) slab(trim, e, h - 0.45, 0.22, 0.3, [0.82, 0.79, 0.71]);
      }
    }

    if (shop) {
      // Ground-floor awnings and a sign band give the low street wall a rhythm.
      const awning = AWNINGS[Math.floor(hash01(seed + 61) * AWNINGS.length)];
      for (const e of edges) {
        if (e.len < 4.5 || e.len > 20) continue;
        slab(trim, e, 2.95, 0.12, 1.15, awning);
        if (e.len > 7) {
          const signX = (e.x0 + e.x1) / 2 + e.nx * 0.16;
          const signZ = (e.z0 + e.z1) / 2 + e.nz * 0.16;
          box(trim, signX, 3.28, signZ, Math.min(4.8, e.len * 0.5), 0.62, 0.1, [0.14, 0.16, 0.15]);
        }
      }
    }

    if (apartment || shop) {
      // Balconies every second storey on the longer façades. Railings are a
      // thin plate at the outer edge, not a solid wall.
      const floors = Math.floor(h / FLOOR_H);
      for (let f = 1; f < Math.min(floors, 8); f += 2) {
        for (const e of edges) {
          if (e.len < 4.5 || e.len > 15) continue;
          if (hash01(seed + f * 31 + Math.round(e.len * 11)) < 0.42) continue;
          const y = f * FLOOR_H;
          slab(trim, e, y, 0.16, 0.72, [0.78, 0.76, 0.7]);
          slab(trim, e, y + 0.16, 0.72, 0.07, [0.2, 0.23, 0.22]);
        }
      }
    }

    if (tower) {
      // Crown and a mechanical storey give the tall buildings a top, instead
      // of the flat cut that reads as a missing mesh from the chase camera.
      const s = 0.62 + hash01(seed + 51) * 0.14;
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(p[2 * i] - cx, p[2 * i + 1] - cz));
      box(clutter, cx, h, cz, r * 2 * s, h * 0.09, r * 2 * s * 0.8, [0.4, 0.45, 0.46]);
      box(clutter, cx, h + h * 0.09, cz, r * 1.05, 0.5, r * 0.9, [0.5, 0.51, 0.5]);
      // Vertical corner piers make the crown read as architecture, not a box.
      for (const e of edges) {
        box(trim, e.x0, podiumH, e.z0, 0.32, h - podiumH, 0.32, [0.55, 0.57, 0.55]);
      }
    }

    // Rooftop water tanks, AC condensers and stair bulkheads. Placed on the
    // roof rather than at a random footprint vertex so they do not float.
    if (!house && h > 5 && hash01(seed + 7) > 0.38) {
      const ox = (hash01(seed + 13) - 0.5) * 5;
      const oz = (hash01(seed + 17) - 0.5) * 5;
      const bw = 1.3 + hash01(seed + 21) * 1.5;
      const bh = 0.9 + hash01(seed + 31) * 1.9;
      box(clutter, cx + ox, h + 0.5, cz + oz, bw, bh, bw * (0.7 + hash01(seed + 41) * 0.6), [0.33, 0.33, 0.31]);
      if (hash01(seed + 43) > 0.5) {
        box(clutter, cx - ox * 0.8, h + 0.5, cz - oz * 0.8, 1.05, 0.5, 0.72, [0.46, 0.47, 0.45]);
      }
    }
  }

  return { walls, glass, trim, roofs, clutter };
}

/** Axis-aligned box (flat shaded) appended to a mesh. */
export function box(
  m: MeshArrays,
  cx: number, cy: number, cz: number,
  w: number, h: number, d: number,
  color: [number, number, number]
) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const y0 = cy, y1 = cy + h;
  const uv: [[number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1]];
  pushTri(m, x0, y1, z0, x1, y1, z0, x1, y1, z1, color, uv, [0, 1, 0]);
  pushTri(m, x0, y1, z0, x1, y1, z1, x0, y1, z1, color, uv, [0, 1, 0]);
  pushTri(m, x0, y0, z1, x1, y0, z1, x1, y1, z1, color, uv, [0, 0, 1]);
  pushTri(m, x0, y0, z1, x1, y1, z1, x0, y1, z1, color, uv, [0, 0, 1]);
  pushTri(m, x1, y0, z0, x0, y0, z0, x0, y1, z0, color, uv, [0, 0, -1]);
  pushTri(m, x1, y0, z0, x0, y1, z0, x1, y1, z0, color, uv, [0, 0, -1]);
  pushTri(m, x0, y0, z0, x0, y0, z1, x0, y1, z1, color, uv, [-1, 0, 0]);
  pushTri(m, x0, y0, z0, x0, y1, z1, x0, y1, z0, color, uv, [-1, 0, 0]);
  pushTri(m, x1, y0, z1, x1, y0, z0, x1, y1, z0, color, uv, [1, 0, 0]);
  pushTri(m, x1, y0, z1, x1, y1, z0, x1, y1, z1, color, uv, [1, 0, 0]);
}
