/**
 * Street-level dressing derived from the same curated road polylines as the
 * asphalt, graph and map overlay.
 *
 * The extractor already records the OSM-mapped lamps (25 in this compact
 * neighbourhood). That is too sparse for a street scene at eye level, so the
 * remainder is generated deterministically along residential and commercial
 * frontages. Like the trees, these are *procedural props*, not surveyed
 * streetlights, and are documented as such.
 */

import type { RoadData, StationData } from './types';

export type FurnitureKind = 'bench' | 'bin' | 'planter' | 'sign';
export type Furniture = { x: number; z: number; yaw: number; kind: FurnitureKind };

const LAMP_CLASSES = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** [x, z, side] triples, matching the world payload. */
export function buildStreetLights(roads: RoadData[], surveyed: number[][]): number[][] {
  const out = surveyed.slice();
  const grid = new Map<string, number[][]>();
  const cell = 18;
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const l of out) {
    const k = key(l[0], l[1]);
    const list = grid.get(k);
    if (list) list.push(l); else grid.set(k, [l]);
  }
  const tooClose = (x: number, z: number) => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = grid.get(`${cx + ox},${cz + oz}`);
        if (!list) continue;
        for (const l of list) if (Math.hypot(l[0] - x, l[1] - z) < 16) return true;
      }
    }
    return false;
  };

  for (const road of roads) {
    if (!LAMP_CLASSES.has(road.cls) || road.bridge || road.tunnel) continue;
    if (road.pts.length < 4) continue;
    const spacing = road.cls === 'primary' ? 30 : road.cls === 'secondary' ? 38 : 52;
    const offset = road.width / 2 + 1.15;
    let carried = hash(road.id) * spacing * 0.5;
    let side = hash(road.id * 7 + 3) > 0.5 ? 1 : -1;
    for (let i = 2; i < road.pts.length; i += 2) {
      const x0 = road.pts[i - 2], z0 = road.pts[i - 1];
      const x1 = road.pts[i], z1 = road.pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const nx = -dz / len, nz = dx / len;
      for (let s = carried; s < len; s += spacing) {
        side = -side;
        const t = s / len;
        const x = Math.round((x0 + dx * t + nx * side * offset) * 10) / 10;
        const z = Math.round((z0 + dz * t + nz * side * offset) * 10) / 10;
        if (tooClose(x, z)) continue;
        out.push([x, z, side]);
        const k = key(x, z);
        const list = grid.get(k);
        if (list) list.push([x, z, side]); else grid.set(k, [[x, z, side]]);
        if (out.length >= 900) return out;
      }
      carried = 0;
    }
  }
  return out;
}

/** Axis-aligned-in-local-space rectangle, rotated into a flat ring. */
export function rectRing(x: number, z: number, w: number, d: number, yaw: number): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: [number, number][] = [
    [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
  ];
  const out: number[] = [];
  for (const [lx, lz] of corners) {
    // yaw 0 = +Z; local x is across, local z along.
    out.push(x + c * lx + s * lz, z - s * lx + c * lz);
  }
  return out;
}

/**
 * Solid footprints for street furniture, lamps and signals.
 *
 * The scene places these props; the car must hit them. Deriving the collision
 * rings from the same arrays means a moved bench moves its collider too.
 */
export function buildPropColliders(
  furniture: Furniture[],
  lights: number[][],
  signals: number[]
): number[][] {
  const out: number[][] = [];
  for (const f of furniture) {
    const [w, d] = f.kind === 'bench' ? [1.75, 0.62] : f.kind === 'planter' ? [1.0, 1.0] : f.kind === 'bin' ? [0.62, 0.62] : [0.32, 0.32];
    out.push(rectRing(f.x, f.z, w, d, f.yaw));
  }
  // Lamps and signals get their concrete base, not the 7 cm pole: a car that
  // clips a 0.3 m square is deflected by the circle solver, which reads as
  // passing through the post. A 0.9 m base is the physical object a bumper
  // would actually hit.
  for (const l of lights) out.push(rectRing(l[0], l[1], 0.9, 0.9, 0));
  for (let i = 0; i < signals.length; i += 2) out.push(rectRing(signals[i], signals[i + 1], 0.8, 0.8, 0));
  return out;
}

/**
 * Benches, bins, planters and wayfinding signs on the verge. Placement is
 * sampled along the same centreline, offset clear of the carriageway. There
 * is no surveyed street-furniture layer in the extract, so this is
 * deliberately presented as generated dressing.
 */
export function buildFurniture(roads: RoadData[], stations: StationData[]): Furniture[] {
  const kinds: FurnitureKind[] = ['bench', 'bin', 'planter', 'sign'];
  const out: Furniture[] = [];
  let n = 0;
  for (const road of roads) {
    if (road.bridge || road.tunnel || road.pts.length < 6) continue;
    const offset = road.width / 2 + 2.25;
    let carried = 10 + hash(road.id + 11) * 26;
    for (let i = 2; i < road.pts.length; i += 2) {
      const x0 = road.pts[i - 2], z0 = road.pts[i - 1];
      const x1 = road.pts[i], z1 = road.pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const nx = -dz / len, nz = dx / len;
      for (let s = carried; s < len - 8; s += 44 + hash(n * 3 + 1) * 32) {
        if (Math.abs(s) < 10 || s > len - 10) continue;
        const side = hash(n * 5 + 2) > 0.5 ? 1 : -1;
        const t = s / len;
        const x = x0 + dx * t + nx * side * offset;
        const z = z0 + dz * t + nz * side * offset;
        if (stations.some((st) => Math.hypot(st.x - x, st.z - z) < 11)) continue;
        out.push({
          x: Math.round(x * 10) / 10,
          z: Math.round(z * 10) / 10,
          yaw: Math.atan2(-nx * side, -nz * side),
          kind: kinds[n % kinds.length],
        });
        n++;
        if (out.length >= 260) return out;
      }
      carried = 0;
    }
  }
  return out;
}
