/**
 * Autopilot finite-state machine.
 *
 * `followRoute` is a pure-pursuit controller: it knows how to stay on a
 * polyline, not what to do when the polyline is blocked by a parked car, a
 * barrier or a pedestrian. This module wraps it in an explicit state machine:
 *
 *   FOLLOW_ROUTE → SLOW_DOWN → STOP_FOR_OBSTACLE → WAIT_OR_REPLAN
 *      → REVERSE_RECOVERY → REORIENT → RESUME_ROUTE
 *      ↘ SAFE_FAILURE
 *
 * Safety rules that are enforced here, not in the UI:
 *
 *   - clearance is measured from the bumper using the same collision grid the
 *     car collides with, so it cannot see a phantom gap or miss a wall;
 *   - reverse only starts when the space behind is clear, and it aborts the
 *     moment that space closes;
 *   - the machine retries twice, then stops for good with a reason instead of
 *     oscillating forward and back forever;
 *   - it never changes the car's position. Every metre moved is `advanceCar`.
 */

import type { CollisionGrid } from './collision.ts';
import { resolveCircle } from './collision.ts';
import type { CarState, DriveCommand } from './vehicle.ts';
import { clamp } from './vehicle.ts';
import { followRoute, routeLength } from './autopilot.ts';
import { pointAt } from './main-street.ts';

export type AutoState =
  | 'FOLLOW_ROUTE'
  | 'SLOW_DOWN'
  | 'STOP_FOR_OBSTACLE'
  | 'WAIT_OR_REPLAN'
  | 'REVERSE_RECOVERY'
  | 'REORIENT'
  | 'RESUME_ROUTE'
  | 'SAFE_FAILURE';

export type BlockReason = 'obstacle' | 'pedestrian' | 'vehicle' | 'boundary';

export type FsmSensors = {
  /** Clear metres ahead of the front bumper, up to `maxClearance`. */
  ahead: number;
  /** Clear metres behind the rear bumper. */
  behind: number;
  /** Metres to the world boundary along the heading. */
  boundary: number;
  /** What stopped us, when something did. */
  reason?: BlockReason;
};

export type FsmMemory = {
  state: AutoState;
  stateTime: number;
  /** Total seconds spent stationary against a block in this attempt. */
  blockedTime: number;
  attempts: number;
  /** Cumulative route progress, so a nudge backwards is not "progress". */
  bestProgress: number;
  noProgressTime: number;
  /** One-shot request for the navigation layer to re-plan. */
  replan: boolean;
  /** Whether this drive has already used its single re-plan. */
  replanned: boolean;
  message: string | null;
};

export type FsmResult = {
  command: DriveCommand;
  cursor: number;
  remaining: number;
  arrived: boolean;
  state: AutoState;
  message: string | null;
  replan: boolean;
};

export function createFsmMemory(): FsmMemory {
  return {
    state: 'FOLLOW_ROUTE',
    stateTime: 0,
    blockedTime: 0,
    attempts: 0,
    bestProgress: 0,
    noProgressTime: 0,
    replan: false,
    replanned: false,
    message: null,
  };
}

const MAX_CLEARANCE = 28;

/** Clear metres ahead of the bumper, sampled against the collision grid. */
export function clearanceAhead(
  grid: CollisionGrid,
  car: { x: number; z: number; yaw: number },
  max = MAX_CLEARANCE,
  radius = 0.9
): number {
  const sx = Math.sin(car.yaw);
  const sz = Math.cos(car.yaw);
  for (let d = 2.2; d <= max + 2.2; d += 0.35) {
    if (resolveCircle(grid, car.x + sx * d, car.z + sz * d, radius).hit) {
      return Math.max(0, d - 2.2);
    }
  }
  return max;
}

/**
 * Clear metres along the route ahead of `cursor`.
 *
 * A straight ray from the bumper is the wrong sensor: at a corner it reports
 * the building on the outside of the bend as a head-on obstacle, so the car
 * brakes at every turn. Sampling the route itself reports what the car is
 * actually about to drive into.
 */
export function routeClearance(
  route: number[],
  cursor: number,
  grid: CollisionGrid,
  max = MAX_CLEARANCE,
  radius = 0.95
): number {
  for (let d = 2.4; d <= max + 2.4; d += 0.35) {
    const p = pointAt(route, cursor + d);
    if (resolveCircle(grid, p.x, p.z, radius).hit) return Math.max(0, d - 2.4);
  }
  return max;
}

/** Distance to the nearest pedestrian standing on the route ahead. */
export function pedestrianAlongRoute(
  route: number[],
  cursor: number,
  people: { x: number; z: number }[],
  max = 22
): number {
  for (let d = 2.4; d <= max; d += 0.6) {
    const p = pointAt(route, cursor + d);
    for (const person of people) {
      if (Math.hypot(person.x - p.x, person.z - p.z) < 1.8) return Math.max(0, d - 2.4);
    }
  }
  return max;
}

/** Clear metres behind the rear bumper. */
export function clearanceBehind(
  grid: CollisionGrid,
  car: { x: number; z: number; yaw: number },
  max = 14,
  radius = 0.9
): number {
  const sx = -Math.sin(car.yaw);
  const sz = -Math.cos(car.yaw);
  for (let d = 2.2; d <= max + 2.2; d += 0.35) {
    if (resolveCircle(grid, car.x + sx * d, car.z + sz * d, radius).hit) {
      return Math.max(0, d - 2.2);
    }
  }
  return max;
}

/** Metres from the car to the world boundary in the direction of travel. */
export function boundaryAhead(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  car: { x: number; z: number; yaw: number },
  margin = 12
): number {
  const sx = Math.sin(car.yaw);
  const sz = Math.cos(car.yaw);
  const hits: number[] = [];
  if (sx > 0.01) hits.push((bounds.maxX - margin - car.x) / sx);
  if (sx < -0.01) hits.push((bounds.minX + margin - car.x) / sx);
  if (sz > 0.01) hits.push((bounds.maxZ - margin - car.z) / sz);
  if (sz < -0.01) hits.push((bounds.minZ + margin - car.z) / sz);
  return Math.max(0, Math.min(...hits.filter((h) => h > 0), 999));
}

/**
 * Shortest distance to a pedestrian inside the forward corridor, measured from
 * the bumper. Pedestrians are soft obstacles: the car slows and stops short.
 */
export function pedestrianAhead(
  car: { x: number; z: number; yaw: number },
  people: { x: number; z: number }[]
): number {
  let best = Infinity;
  const sx = Math.sin(car.yaw);
  const sz = Math.cos(car.yaw);
  for (const p of people) {
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const along = dx * sx + dz * sz;
    if (along < 0 || along > 16) continue;
    const lateral = Math.abs(dx * sz - dz * sx);
    if (lateral > 1.7) continue;
    best = Math.min(best, Math.max(0, along - 2.2 - 0.9));
  }
  return best;
}

/** Braking distance at a comfortable deceleration, plus a standing gap. */
function stopDistance(speed: number): number {
  return 3.4 + Math.abs(speed) * 0.72;
}

const BRAKE: DriveCommand = { throttle: 0, brake: 1, steer: 0 };

/**
 * Advance the state machine one frame.
 *
 * `memory` is mutated in place (it lives outside React), and the returned
 * command is the only thing that reaches the physics.
 */
export function stepDriveFsm(
  route: number[],
  car: CarState,
  memory: FsmMemory,
  dt: number,
  sensors: FsmSensors
): FsmResult {
  const base = followRoute(route, car, memory.bestProgress, 0);
  // followRoute's cursor is used as the route hint; `bestProgress` is our
  // monotonic safety net so reversing cannot rewind the route.
  const cursor = Math.max(memory.bestProgress, base.cursor);
  memory.bestProgress = cursor;
  const speed = Math.abs(car.speed);
  const gap = stopDistance(speed);
  const blocking = sensors.reason !== undefined || sensors.ahead < gap || sensors.boundary < gap;

  memory.stateTime += dt;
  memory.replan = false;

  const transition = (next: AutoState, message: string | null = null) => {
    memory.state = next;
    memory.stateTime = 0;
    memory.message = message;
  };

  const brake: FsmResult = {
    command: BRAKE,
    cursor,
    remaining: Math.max(0, routeLength(route) - cursor),
    arrived: false,
    state: memory.state,
    message: memory.message,
    replan: false,
  };

  if (memory.state === 'SAFE_FAILURE') {
    memory.message = memory.message ?? 'The road is blocked and there is no safe space to recover.';
    return { ...brake, state: 'SAFE_FAILURE', command: BRAKE };
  }

  if (memory.state === 'REVERSE_RECOVERY') {
    if (memory.attempts > 2) {
      transition('SAFE_FAILURE', 'Recovery limit reached; stopping for manual control.');
      return { ...brake, state: 'SAFE_FAILURE' };
    }
    // Abort immediately if something has moved in behind us.
    if (sensors.behind < 1.4 || memory.stateTime > 2.6) {
      transition('REORIENT');
      return { ...brake, state: 'REORIENT', command: BRAKE };
    }
    // Reverse gently, steering the nose away from the obstruction.
    const steer = clamp(-base.command.steer * 0.7, -0.55, 0.55);
    return {
      command: { throttle: -0.5, brake: 0, steer },
      cursor,
      remaining: Math.max(0, routeLength(route) - cursor),
      arrived: false,
      state: 'REVERSE_RECOVERY',
      message: 'Reversing to a clear position…',
      replan: false,
    };
  }

  if (memory.state === 'REORIENT') {
    // A short forward nudge with the wheels pointed back at the route. It only
    // runs while the front is clear; otherwise the recovery has failed.
    if (sensors.ahead < 1.6) {
      transition('WAIT_OR_REPLAN');
      return { ...brake, state: 'WAIT_OR_REPLAN' };
    }
    if (memory.stateTime > 1.5) {
      transition(
        memory.attempts >= 2 ? 'SAFE_FAILURE' : 'WAIT_OR_REPLAN',
        memory.attempts >= 2 ? 'Tried to reverse and rejoin twice; stopping for manual control.' : null
      );
      return { ...brake, state: memory.state };
    }
    return {
      command: {
        throttle: Math.min(0.42, base.command.throttle || 0.3),
        brake: 0,
        steer: clamp(base.command.steer * 1.25, -1, 1),
      },
      cursor,
      remaining: Math.max(0, routeLength(route) - cursor),
      arrived: false,
      state: 'REORIENT',
      message: 'Rejoining the route…',
      replan: false,
    };
  }

  if (memory.state === 'WAIT_OR_REPLAN' || memory.state === 'STOP_FOR_OBSTACLE') {
    memory.blockedTime += dt;
    // Hold the brake until the obstruction clears or the wait expires.
    if (memory.state === 'STOP_FOR_OBSTACLE' && (speed < 0.25 || sensors.ahead < 1.5)) {
      transition('WAIT_OR_REPLAN');
      return { ...brake, state: 'WAIT_OR_REPLAN', message: 'Path blocked — checking for a way around.' };
    }
    if (!blocking && memory.state === 'WAIT_OR_REPLAN') {
      transition('RESUME_ROUTE', null);
      return { ...brake, state: 'RESUME_ROUTE' };
    }
    if (memory.stateTime > 1.4) {
      if (sensors.behind > 5 && memory.attempts < 2) {
        // Count the attempt when it *starts*. Counting on the way out let a
        // reorient that immediately re-blocked skip the increment and reverse
        // forever, which is exactly the oscillation this limit exists for.
        memory.attempts += 1;
        transition('REVERSE_RECOVERY', 'Reversing to find a clear line.');
        return { ...brake, state: 'REVERSE_RECOVERY' };
      }
      // One replan attempt before concluding the road is impassable.
      if (!memory.replanned && memory.attempts === 0) {
        memory.replanned = true;
        memory.replan = true;
        transition('WAIT_OR_REPLAN', 'No clear line — recalculating a route.');
        return { ...brake, state: 'WAIT_OR_REPLAN', replan: true };
      }
      transition('SAFE_FAILURE', 'The road is blocked and there is no safe space to recover.');
      return { ...brake, state: 'SAFE_FAILURE', message: memory.message, command: BRAKE };
    }
    return {
      ...brake,
      state: memory.state,
      message: memory.message ?? 'Waiting for the obstruction to clear…',
    };
  }

  if (memory.state === 'RESUME_ROUTE') {
    if (memory.stateTime > 0.7) transition('FOLLOW_ROUTE');
    return {
      command: base.command,
      cursor,
      remaining: base.remaining,
      arrived: base.arrived,
      state: memory.state,
      message: null,
      replan: false,
    };
  }

  // --- normal driving ---------------------------------------------------
  if (base.arrived) {
    return {
      command: { throttle: 0, brake: 1, steer: 0 },
      cursor,
      remaining: base.remaining,
      arrived: true,
      state: memory.state,
      message: null,
      replan: false,
    };
  }

  // No progress while asking for throttle means something physical is in the
  // way even if the ray samples missed it (a corner catching the chassis).
  if (speed < 0.35 && base.command.throttle > 0.12 && memory.state !== 'SLOW_DOWN') {
    memory.noProgressTime += dt;
  } else {
    memory.noProgressTime = 0;
  }

  if (blocking || memory.noProgressTime > 2.2) {
    const reason = sensors.reason;
    const slow = sensors.ahead > 1.5 && speed > 1;
    if (slow) {
      transition('SLOW_DOWN', reason === 'pedestrian' ? 'Pedestrian ahead.' : 'Obstruction ahead.');
      return {
        command: {
          throttle: 0,
          brake: clamp(0.25 + (gap - sensors.ahead) / Math.max(1, gap) * 0.7, 0.25, 1),
          steer: base.command.steer,
        },
        cursor,
        remaining: base.remaining,
        arrived: false,
        state: 'SLOW_DOWN',
        message: memory.message,
        replan: false,
      };
    }
    transition('STOP_FOR_OBSTACLE', reason === 'pedestrian' ? 'Waiting for a pedestrian.' : 'Path blocked.');
    return { ...brake, state: 'STOP_FOR_OBSTACLE', message: memory.message };
  }

  if (memory.state === 'SLOW_DOWN') transition('FOLLOW_ROUTE');
  return {
    command: base.command,
    cursor,
    remaining: base.remaining,
    arrived: base.arrived,
    state: memory.state === 'SLOW_DOWN' ? 'FOLLOW_ROUTE' : memory.state,
    message: null,
    replan: false,
  };
}
