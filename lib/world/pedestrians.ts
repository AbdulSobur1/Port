/**
 * Sidewalk population.
 *
 * Pedestrians are derived from the same curated road polylines as the asphalt:
 * each road contributes two offset "walk paths" at sidewalk distance, so a
 * pedestrian can never wander into a live lane by construction. Additional
 * agents stand outside project addresses, sit on generated benches, and cross at
 * the mapped crossings.
 *
 * Movement is deterministic (seeded by agent id) and collision-aware in the
 * cheap sense that matters at street scale:
 *
 *   - walkers pause instead of intersecting each other;
 *   - anyone close to the player's car stops and steps onto the verge;
 *   - crossers yield to an approaching car before leaving the kerb;
 *   - nobody is a rigid body the car can push through at speed.
 *
 * The module is pure: the React component owns the instanced meshes and calls
 * `stepPedestrians` once per frame.
 */

import { pointAt } from './main-street.ts';
import type { RoadData, StationData } from './types.ts';
import type { Furniture } from './props.ts';

export type WalkPath = { p: number[]; len: number; kind: 'walk' | 'cross'; roadName: string | null };

export type Pedestrian = {
  id: number;
  kind: 'walker' | 'idler' | 'sitter' | 'crosser';
  path: number;
  /** Distance along the path, metres. */
  s: number;
  dir: 1 | -1;
  speed: number;
  /** Fixed position for idlers/sitters. */
  x: number;
  z: number;
  baseYaw: number;
  yaw: number;
  /** Sideways offset from the path, used for dodging and passing. */
  offset: number;
  targetOffset: number;
  pause: number;
  phase: number;
};

const WALKABLE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian']);

function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** Offset a polyline by `offset` metres using miter normals. */
function offsetPolyline(p: number[], offset: number): number[] {
  const n = p.length / 2;
  const seg: { nx: number; nz: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = p[2 * i + 2] - p[2 * i];
    const dz = p[2 * i + 3] - p[2 * i + 1];
    const len = Math.hypot(dx, dz) || 1;
    seg.push({ nx: -dz / len, nz: dx / len });
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = seg[Math.max(0, i - 1)];
    const b = seg[Math.min(seg.length - 1, i)];
    let nx = a.nx + b.nx, nz = a.nz + b.nz;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    const scale = 1 / Math.max(0.6, nx * a.nx + nz * a.nz);
    out.push(p[2 * i] + nx * offset * scale, p[2 * i + 1] + nz * offset * scale);
  }
  return out;
}

function lengthOf(p: number[]): number {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return acc;
}

/** Closest distance and distance-along for a point against a polyline. */
function closestOnPolyline(p: number[], x: number, z: number): { s: number; distance: number } {
  let acc = 0;
  let bestS = 0;
  let bestD = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
    const d = Math.hypot(x0 + dx * t - x, z0 + dz * t - z);
    if (d < bestD) {
      bestD = d;
      bestS = acc + t * Math.sqrt(l2);
    }
    acc += Math.sqrt(l2);
  }
  return { s: bestS, distance: bestD };
}

/** Two walk paths per drivable road, clear of the carriageway. */
export function buildWalkPaths(roads: RoadData[]): WalkPath[] {
  const out: WalkPath[] = [];
  for (const road of roads) {
    if (road.bridge || road.tunnel) continue;
    if (!WALKABLE.has(road.cls) || road.pts.length < 6) continue;
    const walk = road.width / 2 + 1.55;
    for (const side of [-1, 1]) {
      const p = offsetPolyline(road.pts, side * walk);
      const len = lengthOf(p);
      if (len < 26) continue;
      out.push({ p, len, kind: 'walk', roadName: road.name });
    }
  }
  return out;
}

/** Crossings become short paths from one kerb to the other. */
export function buildCrossPaths(crossings: { x: number; z: number; h: number; w: number }[]): WalkPath[] {
  return crossings.map((c) => {
    const half = c.w / 2 + 2.6;
    const nx = Math.cos(c.h);
    const nz = -Math.sin(c.h);
    return {
      p: [c.x - nx * half, c.z - nz * half, c.x + nx * half, c.z + nz * half],
      len: half * 2,
      kind: 'cross' as const,
      roadName: null,
    };
  });
}

export type PopulationInput = {
  roads: RoadData[];
  stations: StationData[];
  furniture: Furniture[];
  crossings: { x: number; z: number; h: number; w: number }[];
  /** Cap on moving walkers; the rest of the population is static. */
  walkers?: number;
};

export type Population = {
  paths: WalkPath[];
  people: Pedestrian[];
};

/**
 * Build the population once. Placement is seeded, so the same street always has
 * the same crowd and a screenshot is reproducible.
 */
export function buildPopulation(input: PopulationInput): Population {
  const walkPaths = buildWalkPaths(input.roads);
  const crossPaths = buildCrossPaths(input.crossings ?? []);
  const paths = [...walkPaths, ...crossPaths];
  const people: Pedestrian[] = [];
  let id = 0;

  const walkerCount = Math.min(input.walkers ?? 52, Math.max(12, walkPaths.length));
  for (let i = 0; i < walkerCount; i++) {
    const pathIndex = Math.floor(hash(i * 17 + 3) * walkPaths.length);
    const path = walkPaths[pathIndex];
    if (!path) break;
    const dir: 1 | -1 = hash(i * 29 + 7) > 0.5 ? 1 : -1;
    const s = Math.max(2, Math.min(path.len - 2, hash(i * 13 + 1) * path.len));
    const p = pointAt(path.p, s);
    people.push({
      id: id++,
      kind: 'walker',
      path: pathIndex,
      s,
      dir,
      speed: 1.05 + hash(i * 31 + 11) * 0.55,
      x: p.x,
      z: p.z,
      baseYaw: p.heading,
      yaw: p.heading + (dir < 0 ? Math.PI : 0),
      offset: (hash(i * 7 + 5) - 0.5) * 0.5,
      targetOffset: (hash(i * 7 + 5) - 0.5) * 0.5,
      pause: hash(i * 19 + 5) * 2,
      phase: hash(i * 23 + 9) * Math.PI * 2,
    });
  }

  // More walkers near the addresses, so every stop has life around it even
  // when the city-wide population is spread thinly over 15 km of pavement.
  input.stations.forEach((station, si) => {
    let bestPath = -1;
    let bestS = 0;
    let bestD = Infinity;
    walkPaths.forEach((wp, pi) => {
      const near = closestOnPolyline(wp.p, station.x, station.z);
      if (near.distance < bestD) {
        bestD = near.distance;
        bestPath = pi;
        bestS = near.s;
      }
    });
    if (bestPath < 0) return;
    for (let k = 0; k < 2; k++) {
      const path = walkPaths[bestPath];
      const s = Math.max(2, Math.min(path.len - 2, bestS + (k === 0 ? -7 : 9) + hash(si * 11 + k) * 4));
      const p = pointAt(path.p, s);
      const dir: 1 | -1 = k === 0 ? 1 : -1;
      people.push({
        id: id++,
        kind: 'walker',
        path: bestPath,
        s,
        dir,
        speed: 1.0 + hash(si * 13 + k) * 0.5,
        x: p.x,
        z: p.z,
        baseYaw: p.heading,
        yaw: p.heading + (dir < 0 ? Math.PI : 0),
        offset: (hash(si * 7 + k) - 0.5) * 0.4,
        targetOffset: 0,
        pause: 0.2 + k * 0.4,
        phase: hash(si * 19 + k) * Math.PI * 2,
      });
    }
  });

  // People waiting outside project addresses: two per stop, on the forecourt
  // side but clear of the entrance and the parking bays.
  input.stations.forEach((station, si) => {
    for (let k = 0; k < 2; k++) {
      const along = (k === 0 ? -1 : 1) * (6.5 + hash(si * 13 + k) * 2);
      const across = 8.5 + hash(si * 17 + k) * 1.8;
      const x = station.x + Math.cos(station.heading) * across + Math.sin(station.heading) * along;
      const z = station.z - Math.sin(station.heading) * across + Math.cos(station.heading) * along;
      people.push({
        id: id++,
        kind: 'idler',
        path: -1,
        s: 0,
        dir: 1,
        speed: 0,
        x,
        z,
        baseYaw: station.heading + Math.PI,
        yaw: station.heading + Math.PI,
        offset: 0,
        targetOffset: 0,
        pause: 2 + hash(si * 19 + k) * 6,
        phase: hash(si * 23 + k) * Math.PI * 2,
      });
    }
  });

  // Sitters: one person on every other bench, facing the street.
  input.furniture
    .filter((f) => f.kind === 'bench')
    .filter((_, i) => i % 2 === 0)
    .slice(0, 12)
    .forEach((bench, i) => {
      people.push({
        id: id++,
        kind: 'sitter',
        path: -1,
        s: 0,
        dir: 1,
        speed: 0,
        x: bench.x,
        z: bench.z,
        baseYaw: bench.yaw,
        yaw: bench.yaw,
        offset: 0,
        targetOffset: 0,
        pause: 0,
        phase: hash(i * 37 + 13) * Math.PI * 2,
      });
    });

  // Crossers: two per mapped crossing, walking back and forth.
  crossPaths.forEach((path, ci) => {
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : path.len - 1;
      const p = pointAt(path.p, s);
      people.push({
        id: id++,
        kind: 'crosser',
        path: walkPaths.length + ci,
        s,
        dir: k === 0 ? 1 : -1,
        speed: 1.15,
        x: p.x,
        z: p.z,
        baseYaw: p.heading,
        yaw: p.heading + (k === 0 ? 0 : Math.PI),
        offset: 0,
        targetOffset: 0,
        pause: 1 + ci + k,
        phase: hash(ci * 31 + k) * Math.PI * 2,
      });
    }
  });

  return { paths, people };
}

/** Reused output array so the per-frame update does not allocate. */
export type PedestrianPositions = { x: number; z: number; yaw: number; kind: Pedestrian['kind'] }[];

/**
 * Advance the crowd by `dt` seconds.
 *
 * Writes world positions back onto `people` (the instanced renderer reads them)
 * and into `out` (for the autopilot, map and diagnostics).
 */
export function stepPedestrians(
  population: Population,
  people: Pedestrian[],
  dt: number,
  car: { x: number; z: number; speed: number; yaw: number },
  out: PedestrianPositions
): void {
  const { paths } = population;
  const carSpeed = Math.abs(car.speed);

  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    person.pause = Math.max(0, person.pause - dt);
    person.phase += dt * (person.kind === 'walker' || person.kind === 'crosser' ? 7.4 : 0.8) * (person.kind === 'sitter' ? 0.3 : 1);

    const dx = person.x - car.x;
    const dz = person.z - car.z;
    const carDistance = Math.hypot(dx, dz);
    const danger = carDistance < 8 && carSpeed > 1.5;

    if (person.kind === 'walker' || person.kind === 'crosser') {
      const path = paths[person.path];
      if (path) {
        const moving = person.pause <= 0 && !danger;
        if (moving) {
          person.s += person.speed * person.dir * dt;
          if (person.s > path.len - 1.2) {
            person.s = path.len - 1.2;
            person.dir = -1;
            person.pause = 0.9 + hash(person.id * 3 + 1) * 2.2;
          } else if (person.s < 1.2) {
            person.s = 1.2;
            person.dir = 1;
            person.pause = 0.9 + hash(person.id * 3 + 2) * 2.2;
          }
        }
        // Dodging: step away from the car, toward the inside of the pavement.
        const p = pointAt(path.p, person.s);
        const nx = Math.cos(p.heading);
        const nz = -Math.sin(p.heading);
        const toCar = (car.x - p.x) * nx + (car.z - p.z) * nz;
        person.targetOffset = danger ? (toCar > 0 ? -1.15 : 1.15) : person.kind === 'crosser' ? 0 : person.offset;
        if (danger) person.pause = Math.max(person.pause, 0.45);
        // Crossers only leave the kerb when the road is clear.
        if (person.kind === 'crosser' && carDistance < 14 && carSpeed > 3) person.pause = Math.max(person.pause, 0.7);
        person.offset += (person.targetOffset - person.offset) * Math.min(1, dt * 3.2);
        const lateral = person.offset;
        person.x = p.x + nx * lateral;
        person.z = p.z + nz * lateral;
        person.baseYaw = p.heading;
        person.yaw = p.heading + (person.dir < 0 ? Math.PI : 0);
        if (danger) {
          // Face the approaching car: readable from the chase camera and a
          // cheap signal that the crowd has noticed the player.
          person.yaw = Math.atan2(car.x - person.x, car.z - person.z);
        }
      }
    } else if (person.kind === 'idler') {
      const sway = Math.sin(person.phase * 0.55) * 0.35;
      person.yaw = person.baseYaw + sway;
      if (danger) person.yaw = Math.atan2(car.x - person.x, car.z - person.z);
    } else {
      person.yaw = person.baseYaw;
    }

    // Simple separation: if two people are too close, one eases away. This is
    // O(n²) over ~80 agents; cheaper than a spatial hash and measured at well
    // under a millisecond.
    for (let j = i + 1; j < people.length; j++) {
      const other = people[j];
      if (other.kind === 'sitter') continue;
      const ox = other.x - person.x;
      const oz = other.z - person.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 1.1 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (1.1 - d) * 0.5;
      const ux = ox / d, uz = oz / d;
      const slide = person.id % 2 === 0 ? 1 : -1;
      person.offset = Math.max(-1.4, Math.min(1.4, person.offset + ux * push * slide));
      other.offset = Math.max(-1.4, Math.min(1.4, other.offset - ux * push * slide));
      if (person.kind !== 'sitter') person.pause = Math.max(person.pause, 0.15);
    }

    if (out[i]) {
      out[i].x = person.x;
      out[i].z = person.z;
      out[i].yaw = person.yaw;
      out[i].kind = person.kind;
    } else {
      out[i] = { x: person.x, z: person.z, yaw: person.yaw, kind: person.kind };
    }
  }
}
