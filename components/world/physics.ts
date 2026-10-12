/**
 * Vehicle movement, collision resolution and navigation.
 *
 * DESIGN
 * ------
 * - One authoritative motion model: this module owns the vehicle's world position,
 *   heading and scalar speed. React never drives the car; `useFrame` calls `stepVehicle`.
 * - Collision geometry is *derived from the same data the renderer uses*
 *   (`world-layout.ts`), so buildings can never be visually solid but physically absent.
 * - Movement is sub-divided into small steps (<= MAX_SUBSTEP metres each). Because every
 *   sub-step is resolved against all colliders before the next one is taken, the vehicle
 *   cannot tunnel through an obstacle even at maximum speed or after a stalled frame
 *   (dt is also clamped). Penetration is resolved by pushing the circle out along the
 *   contact normal, which also produces natural wall-sliding.
 * - `createWorld(layout)` builds an isolated physics world (its own collider set and
 *   bounds) so several distinct cities can coexist. The module-level functions below
 *   remain bound to the default hub world for backwards compatibility.
 * - This module has no React / three.js runtime dependencies so it can be unit-tested
 *   deterministically in Node.
 */

import { hubLayout, type Station, type WorldLayout } from './world-layout';

export type CircleCollider = { type: 'circle'; x: number; z: number; r: number };
export type BoxCollider = { type: 'box'; x: number; z: number; hx: number; hz: number };
export type Collider = CircleCollider | BoxCollider;

export type Point2 = { x: number; z: number };

export type Vehicle = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  honkAge: number;
};

/* ---------------------------------------------------------------- tuning ---- */

export const VEHICLE_RADIUS = 0.8; // collision footprint (approx. of the 1.18 x 1.95 body)

const MAX_SPEED = 10; // m/s (~36 km/h) — tuned for the size of the map
const MAX_REVERSE_SPEED = 3.5;
const ACCELERATION = 12;
const BRAKE_DECELERATION = 22;
const COAST_DRAG = 3.2;
const STEER_RESPONSE = 6.5;
const STEER_RETURN = 5.5;
const MAX_YAW_RATE = 2.4; // rad/s at/above TURN_SPEED_REF
const TURN_SPEED_REF = 3; // speed at which steering reaches full yaw rate
const COLLISION_DAMP = 0.5; // speed kept per sub-step while scraping an obstacle

const MAX_DT = 1 / 30; // clamp so a stalled/backgrounded frame cannot teleport the car
const MAX_SUBSTEP = 0.08; // metres per collision sub-step (<< smallest collider size)

const ROUTE_GRID = 1;
const ROUTE_MARGIN = 0.1;

/* --------------------------------------------------------------- helpers ---- */

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

function approach(current: number, target: number, amount: number) {
  return current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
}

/** Distance from a point to a collider's surface (0 when inside). */
function distanceToSurface(x: number, z: number, c: Collider): number {
  if (c.type === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r;
  const dx = (x - c.x) - clamp(x - c.x, -c.hx, c.hx);
  const dz = (z - c.z) - clamp(z - c.z, -c.hz, c.hz);
  return Math.hypot(dx, dz);
}

function buildColliders(layout: WorldLayout): Collider[] {
  const list: Collider[] = [];
  if (layout.landmark) list.push({ type: 'circle', x: layout.landmark.x, z: layout.landmark.z, r: layout.landmark.radius });
  for (const b of layout.buildings) {
    // Match the visible foundation footprint (box is w+0.55 x d+0.55).
    list.push({ type: 'box', x: b.x, z: b.z, hx: b.w / 2 + 0.28, hz: b.d / 2 + 0.28 });
  }
  for (const [x, z, scale] of layout.treePositions) {
    list.push({ type: 'circle', x, z, r: 0.8 * scale });
  }
  for (const [x, z] of layout.lampPositions) {
    list.push({ type: 'circle', x, z, r: 0.22 });
  }
  for (const w of layout.perimeterWalls) {
    list.push({ type: 'box', x: w.x, z: w.z, hx: w.hx, hz: w.hz });
  }
  return list;
}

type Push = { x: number; z: number; nx: number; nz: number; depth: number };

/** Push a circle of radius R out of a single collider, returning the new pose + normal. */
function pushOut(x: number, z: number, c: Collider): Push | null {
  if (c.type === 'circle') {
    const dx = x - c.x;
    const dz = z - c.z;
    const distance = Math.hypot(dx, dz);
    const minimum = c.r + VEHICLE_RADIUS;
    if (distance >= minimum) return null;
    const nx = distance > 1e-6 ? dx / distance : 1;
    const nz = distance > 1e-6 ? dz / distance : 0;
    return { x: c.x + nx * minimum, z: c.z + nz * minimum, nx, nz, depth: minimum - distance };
  }

  const dx = (x - c.x) - clamp(x - c.x, -c.hx, c.hx); // vector from closest point on box
  const dz = (z - c.z) - clamp(z - c.z, -c.hz, c.hz);
  const distance = Math.hypot(dx, dz);
  if (distance > VEHICLE_RADIUS) return null;

  if (distance > 1e-6) {
    const nx = dx / distance;
    const nz = dz / distance;
    const depth = VEHICLE_RADIUS - distance;
    return { x: x + nx * depth, z: z + nz * depth, nx, nz, depth };
  }

  // Centre is inside the box: exit along the axis of least penetration.
  const relX = x - c.x;
  const relZ = z - c.z;
  const penX = c.hx + VEHICLE_RADIUS - Math.abs(relX);
  const penZ = c.hz + VEHICLE_RADIUS - Math.abs(relZ);
  if (penX < penZ) {
    const nx = relX >= 0 ? 1 : -1;
    return { x: c.x + nx * (c.hx + VEHICLE_RADIUS), z, nx, nz: 0, depth: penX };
  }
  const nz = relZ >= 0 ? 1 : -1;
  return { x, z: c.z + nz * (c.hz + VEHICLE_RADIUS), nx: 0, nz, depth: penZ };
}

/* ================================================================= world ==== */

export type World = ReturnType<typeof createWorld>;

/**
 * Build an isolated, self-contained physics world from a layout. Each world owns its
 * own colliders and bounds, so movement, queries and pathfinding never leak between
 * cities. The returned `steer`/`step` API mirrors the module-level defaults below.
 */
export function createWorld(layout: WorldLayout) {
  const colliders = buildColliders(layout);
  const bounds = layout.bounds;

  /** Resolve any penetration against every collider + world bounds. Returns the deepest normal. */
  function resolvePenetration(v: Vehicle): { hit: boolean; nx: number; nz: number } {
    let hit = false;
    let best: Push | null = null;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const c of colliders) {
        const push = pushOut(v.x, v.z, c);
        if (!push) continue;
        v.x = push.x;
        v.z = push.z;
        moved = true;
        hit = true;
        if (!best || push.depth > best.depth) best = push;
      }
      const cx = clamp(v.x, -bounds, bounds);
      const cz = clamp(v.z, -bounds, bounds);
      if (cx !== v.x || cz !== v.z) {
        v.x = cx;
        v.z = cz;
        moved = true;
        hit = true;
      }
      if (!moved) break;
    }
    return { hit, nx: best?.nx ?? 0, nz: best?.nz ?? 0 };
  }

  /**
   * Move the vehicle by its current speed over `dt`, sub-stepping and resolving collisions.
   * On contact the vehicle is stopped short of the obstacle and its speed is damped, while
   * the tangential remainder of the sub-step is applied so the car slides along walls.
   */
  function integrate(v: Vehicle, dt: number) {
    const totalX = Math.sin(v.yaw) * v.speed * dt;
    const totalZ = Math.cos(v.yaw) * v.speed * dt;
    const distance = Math.hypot(totalX, totalZ);
    if (distance < 1e-9) {
      resolvePenetration(v);
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
    const stepX = totalX / steps;
    const stepZ = totalZ / steps;

    for (let i = 0; i < steps; i++) {
      v.x += stepX;
      v.z += stepZ;
      const contact = resolvePenetration(v);
      if (contact.hit) {
        const remaining = (steps - 1 - i) / steps;
        const remX = totalX * remaining;
        const remZ = totalZ * remaining;
        const into = remX * contact.nx + remZ * contact.nz;
        if (into < 0) {
          v.x += remX - into * contact.nx;
          v.z += remZ - into * contact.nz;
          resolvePenetration(v);
        }
        v.speed *= COLLISION_DAMP;
        if (Math.abs(v.speed) < 0.08) v.speed = 0;
        return;
      }
    }
  }

  function stepVehicle(
    v: Vehicle,
    dtRaw: number,
    command: { power: number; brake: boolean; steerCmd: number },
    nearestStation: Station | null
  ) {
    const dt = clamp(dtRaw, 0, MAX_DT);
    v.honkAge = Math.min(99, v.honkAge + dt);

    const power = clamp(command.power, -1, 1);
    if (command.brake) {
      v.speed = approach(v.speed, 0, BRAKE_DECELERATION * dt);
    } else if (power > 0) {
      // Opposite input first brakes, then changes direction instead of snapping to reverse.
      if (v.speed < -0.15) v.speed = approach(v.speed, 0, BRAKE_DECELERATION * dt);
      else v.speed = Math.min(MAX_SPEED, v.speed + ACCELERATION * power * dt);
    } else if (power < 0) {
      if (v.speed > 0.15) v.speed = approach(v.speed, 0, BRAKE_DECELERATION * dt);
      else v.speed = Math.max(-MAX_REVERSE_SPEED, v.speed + ACCELERATION * power * dt);
    } else {
      v.speed = approach(v.speed, 0, COAST_DRAG * dt);
    }
    if (power === 0 && !command.brake && Math.abs(v.speed) < 0.02) v.speed = 0;

    // Steering input eases toward the target; releasing returns the wheel to centre.
    const targetSteer = clamp(command.steerCmd, -1, 1);
    v.steer = targetSteer === 0
      ? approach(v.steer, 0, STEER_RETURN * dt)
      : approach(v.steer, targetSteer, STEER_RESPONSE * dt);

    // Yaw rate scales with speed: the car cannot spin on the spot with no input, and
    // turning is inverted while reversing, matching how a real vehicle follows its heading.
    // A driver actively on the throttle/reverse is allowed a slow pivot even when boxed in,
    // so the car can always turn itself out of a tight corner instead of wedging solid.
    const minSteerFactor = power !== 0 ? 0.3 : 0;
    const speedFactor = clamp(Math.abs(v.speed) / TURN_SPEED_REF, minSteerFactor, 1);
    const direction = v.speed >= 0 ? 1 : -1;
    v.yaw -= v.steer * MAX_YAW_RATE * speedFactor * direction * dt;

    integrate(v, dt);

    // Stations are soft parking zones, not obstacles: ease to a stop when coasting close
    // by, but never fight an active throttle input.
    if (nearestStation && power === 0) {
      const distance = Math.hypot(v.x - nearestStation.x, v.z - nearestStation.z);
      if (distance < nearestStation.radius * 0.72) v.speed = approach(v.speed, 0, 10 * dt);
    }
  }

  function isPointDrivable(x: number, z: number, clearance = VEHICLE_RADIUS + ROUTE_MARGIN): boolean {
    const limit = bounds - clearance;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    for (const c of colliders) {
      if (distanceToSurface(x, z, c) < clearance) return false;
    }
    return true;
  }

  function segmentIsClear(a: Point2, b: Point2, clearance: number): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const samples = Math.max(1, Math.ceil(length / 0.3));
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      if (!isPointDrivable(a.x + dx * t, a.z + dz * t, clearance)) return false;
    }
    return true;
  }

  const ROUTE_CLEARANCE = VEHICLE_RADIUS + ROUTE_MARGIN;

  /**
   * Plan a collision-free route with A* over an 8-connected grid, then simplify it with
   * greedy line-of-sight. Returns `null` when no valid route exists (destination blocked).
   */
  function planRoute(start: Point2, destination: Point2): Point2[] | null {
    const toCell = (value: number) => Math.round(value / ROUTE_GRID);
    const fromCell = (value: number) => value * ROUTE_GRID;
    const startCell = { x: toCell(start.x), z: toCell(start.z) };
    const endCell = { x: toCell(destination.x), z: toCell(destination.z) };
    const key = (p: { x: number; z: number }) => `${p.x},${p.z}`;
    const point = (p: { x: number; z: number }): Point2 => ({ x: fromCell(p.x), z: fromCell(p.z) });
    const heuristic = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

    const startKey = key(startCell);
    const endKey = key(endCell);
    const open = [startCell];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);
    const fScore = new Map<string, number>([[startKey, heuristic(startCell, endCell)]]);
    const visited = new Set<string>();
    const offsets = [
      { x: 1, z: 0, cost: 1 }, { x: -1, z: 0, cost: 1 }, { x: 0, z: 1, cost: 1 }, { x: 0, z: -1, cost: 1 },
      { x: 1, z: 1, cost: Math.SQRT2 }, { x: 1, z: -1, cost: Math.SQRT2 },
      { x: -1, z: 1, cost: Math.SQRT2 }, { x: -1, z: -1, cost: Math.SQRT2 },
    ];
    let found = false;

    for (let iterations = 0; open.length && iterations < 20000; iterations++) {
      open.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
      const current = open.shift()!;
      const currentKey = key(current);
      if (currentKey === endKey) { found = true; break; }
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);

      for (const offset of offsets) {
        const next = { x: current.x + offset.x, z: current.z + offset.z };
        const nextKey = key(next);
        if (visited.has(nextKey)) continue;
        // Always permit the start cell so a car nudged against a wall can still depart.
        if (nextKey !== startKey && !isPointDrivable(fromCell(next.x), fromCell(next.z), ROUTE_CLEARANCE)) continue;
        if (offset.x !== 0 && offset.z !== 0) {
          const sideA = isPointDrivable(fromCell(current.x + offset.x), fromCell(current.z), ROUTE_CLEARANCE);
          const sideB = isPointDrivable(fromCell(current.x), fromCell(current.z + offset.z), ROUTE_CLEARANCE);
          if (nextKey !== startKey && (!sideA || !sideB)) continue;
        }
        const tentative = (gScore.get(currentKey) ?? Infinity) + offset.cost;
        if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        fScore.set(nextKey, tentative + heuristic(next, endCell));
        if (!open.some((candidate) => key(candidate) === nextKey)) open.push(next);
      }
    }

    if (!found) return null;

    const raw: Point2[] = [destination];
    let cursor = endKey;
    while (cursor !== startKey) {
      const [x, z] = cursor.split(',').map(Number);
      raw.push(point({ x, z }));
      const previous = cameFrom.get(cursor);
      if (!previous) return null;
      cursor = previous;
    }
    raw.push(start);
    raw.reverse();

    const simplified: Point2[] = [raw[0]];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let next = raw.length - 1;
      while (next > anchor + 1 && !segmentIsClear(raw[anchor], raw[next], ROUTE_CLEARANCE)) next--;
      simplified.push(raw[next]);
      anchor = next;
    }
    simplified[0] = start;
    simplified[simplified.length - 1] = destination;
    return simplified.slice(1);
  }

  /** Follow a route waypoint using speed-aware steering and controlled arrival braking. */
  function stepAutopilot(v: Vehicle, dt: number, target: Point2, finalTarget: boolean): { done: boolean } {
    const dx = target.x - v.x;
    const dz = target.z - v.z;
    const distance = Math.hypot(dx, dz);

    if (finalTarget && distance < 1.45) {
      v.speed = approach(v.speed, 0, BRAKE_DECELERATION * dt);
      return { done: Math.abs(v.speed) < 0.16 };
    }

    if (!finalTarget && distance < 1.05) {
      v.speed = Math.min(v.speed, 5.2);
      return { done: false };
    }

    const desiredHeading = Math.atan2(dx, dz);
    let angle = desiredHeading - v.yaw;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;

    // `stepVehicle` applies `yaw -= steer * rate`, so a positive heading error needs a
    // negative steer command to bring the nose around toward the waypoint.
    const steerCmd = clamp(-angle * 1.65, -1, 1);
    const cornerFactor = clamp(1 - Math.abs(angle) / 2.3, 0.28, 1);
    const approachFactor = finalTarget ? clamp(distance / 5.5, 0.25, 1) : 1;
    const targetSpeed = 8.5 * Math.min(cornerFactor, approachFactor);
    const power = v.speed < targetSpeed - 0.45 ? 0.78 : 0.16;
    const brake = v.speed > targetSpeed + 1.8;
    stepVehicle(v, dt, { power: brake ? 0 : power, brake, steerCmd }, null);
    return { done: false };
  }

  return {
    id: layout.id,
    layout,
    colliders,
    bounds,
    spawn: layout.spawn,
    stations: layout.stations,
    resolvePenetration,
    stepVehicle,
    isPointDrivable,
    planRoute,
    stepAutopilot,
  };
}

/* ------------------------------------------------- default (hub) exports ---- */

const defaultWorld = createWorld(hubLayout);

/** Every solid obstacle in the default hub world. Derived from `world-layout.ts`. */
export const colliders: Collider[] = defaultWorld.colliders;
export const worldBounds = hubLayout.bounds;
export const resolvePenetration = defaultWorld.resolvePenetration;
export const stepVehicle = defaultWorld.stepVehicle;
export const isPointDrivable = defaultWorld.isPointDrivable;
export const planRoute = defaultWorld.planRoute;
export const stepAutopilot = defaultWorld.stepAutopilot;

export type { Station } from './world-layout';
