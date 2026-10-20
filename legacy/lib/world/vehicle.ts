/**
 * Vehicle dynamics for the drivable Lagos scene.
 *
 * A kinematic bicycle model with a speed-sensitive steering limit, engine
 * curve, rolling resistance and sub-stepped integration. It is intentionally
 * not a rigid-body engine: the car never leaves the flat ground plane, so a
 * full 6-DOF solver would add cost (and WASM payload) without adding feel.
 *
 * Determinism matters here — the tests step the same pure functions at 30, 60
 * and 144 Hz and assert the trajectory converges, which is why integration is
 * a fixed internal step (`SUBSTEP`) and never depends on the frame rate.
 *
 * Collision uses two circles along the chassis against the building OBB grid;
 * substepping caps travel per step at ~0.23 m (27 m/s ÷ 120 Hz), far below the
 * thinnest building depth, so tunnelling is impossible by construction.
 */

import type { CollisionGrid } from './collision.ts';
import { clampToWorld, resolveCircle } from './collision.ts';
import type { VehiclePhysics } from './vehicles.ts';

export type CarState = {
  x: number;
  z: number;
  /** Radians; 0 faces +Z (north), +π/2 faces +X (east). */
  yaw: number;
  /** Signed m/s (negative = reverse). */
  speed: number;
  /** Current road-wheel angle, radians (positive = right). */
  steer: number;
  /** Odometer, metres. */
  distance: number;
  /** Seconds since the last collision, for HUD feedback. */
  sinceHit: number;
};

export type DriveCommand = {
  /** -1 (reverse) … 1 (full throttle). */
  throttle: number;
  /** 0 … 1. */
  brake: number;
  /** -1 (left) … 1 (right). */
  steer: number;
};

export type DriveEnv = {
  grid: CollisionGrid;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Selected vehicle. Omit for the reference car (tests, tools). */
  physics?: VehiclePhysics;
};

/**
 * Reference vehicle: the numbers every test and the autopilot were tuned
 * against. It is also the default if no selection has been made.
 */
export const CAR: VehiclePhysics = {
  wheelBase: 2.72,
  trackWidth: 1.62,
  /** Body length/width used by the renderer and collision circles. */
  length: 4.42,
  width: 1.86,
  maxSteer: 0.62,
  steerRate: 3.4,
  steerReturn: 5.2,
  maxSpeed: 27, // ~97 km/h
  maxReverse: 7,
  engine: 8.2,
  brakeDecel: 13,
  rolling: 1.1,
  drag: 0.0018,
  /** Collision circles. */
  circleOffset: 1.28,
  circleRadius: 1.0,
  mass: 1500,
  grip: 1,
};

export const SUBSTEP = 1 / 120;

export function createCar(spawn: { x: number; z: number; yaw: number }): CarState {
  return { x: spawn.x, z: spawn.z, yaw: spawn.yaw, speed: 0, steer: 0, distance: 0, sinceHit: 99 };
}

export function speedKmh(speed: number): number {
  return Math.abs(speed) * 3.6;
}

/** Maximum road-wheel angle at a given speed (tighter lock when slow). */
export function maxSteerAtSpeed(speed: number, phys: VehiclePhysics = CAR): number {
  return phys.maxSteer / (1 + Math.abs(speed) * 0.055);
}

/**
 * Advance the car by an exact time step. Prefer {@link advanceCar}, which
 * subdivides a frame for you; this is exported for the tests and for the
 * fixed-step loop.
 */
export function stepCar(
  state: CarState,
  dt: number,
  cmd: DriveCommand,
  env: DriveEnv
): { hit: boolean; boundary: boolean } {
  const phys = env.physics ?? CAR;
  const steerTarget = clamp(cmd.steer, -1, 1) * maxSteerAtSpeed(state.speed, phys);
  const steerDelta = clamp(steerTarget - state.steer, -phys.steerRate * dt, phys.steerRate * dt);
  state.steer = Math.abs(cmd.steer) > 0.02
    ? state.steer + steerDelta
    : moveTowards(state.steer, 0, phys.steerReturn * dt);

  const throttle = clamp(cmd.throttle, -1, 1);
  const brake = clamp(cmd.brake, 0, 1);

  // --- longitudinal ---
  let speed = state.speed;
  const braking = brake > 0.01;
  if (braking) {
    speed = moveTowards(speed, 0, phys.brakeDecel * brake * dt);
  } else if (throttle > 0.01) {
    if (speed < -0.4) {
      // rolling backwards while pressing forward = brake first
      speed = moveTowards(speed, 0, phys.brakeDecel * throttle * dt);
    } else {
      const curve = Math.max(0.35, 1 - Math.max(0, speed) / phys.maxSpeed);
      speed += phys.engine * throttle * curve * dt;
      speed = Math.min(speed, phys.maxSpeed);
    }
  } else if (throttle < -0.01) {
    if (speed > 0.4) {
      speed = moveTowards(speed, 0, phys.brakeDecel * -throttle * 0.75 * dt);
    } else {
      const curve = Math.max(0.25, 1 - Math.abs(Math.min(0, speed)) / phys.maxReverse);
      speed -= phys.engine * 0.6 * -throttle * curve * dt;
      speed = Math.max(speed, -phys.maxReverse);
    }
  }

  // --- resistance (always, including coasting) ---
  const resistance = (phys.rolling + phys.drag * speed * speed) * dt;
  if (!braking) speed = moveTowards(speed, 0, resistance);

  state.speed = speed;

  // --- heading & position ---
  const yawRate = (state.speed / phys.wheelBase) * Math.tan(state.steer) * phys.grip;
  state.yaw = normalizeAngle(state.yaw + yawRate * dt);

  const moved = state.speed * dt;
  state.x += Math.sin(state.yaw) * moved;
  state.z += Math.cos(state.yaw) * moved;
  state.distance += Math.abs(moved);

  // --- collisions ---
  // The car is separated from the wall, then only the velocity component that
  // points *into* the wall is absorbed. Glancing contact therefore keeps its
  // speed and slides along the façade instead of sticking to it.
  let hit = false;
  let impact = 0;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const offset of [phys.circleOffset, -phys.circleOffset]) {
      const cxp = state.x + Math.sin(state.yaw) * offset;
      const czp = state.z + Math.cos(state.yaw) * offset;
      const push = resolveCircle(env.grid, cxp, czp, phys.circleRadius);
      if (!push.hit) continue;
      any = true;
      hit = true;
      state.x += push.nx * push.depth;
      state.z += push.nz * push.depth;
      const speed = Math.abs(state.speed);
      if (speed > 0.2) {
        const fx = (Math.sin(state.yaw) * state.speed) / speed;
        const fz = (Math.cos(state.yaw) * state.speed) / speed;
        const into = Math.max(0, -(fx * push.nx + fz * push.nz));
        impact = Math.max(impact, into);
      }
    }
    if (!any) break;
  }

  if (hit) {
    state.sinceHit = 0;
    // Glancing contact slides at speed; only a real frontal impact is absorbed.
    // Applying a multiplier for every grazing substep would glue the car to a
    // wall at 120 Hz, which is exactly the "stuck at an intersection" failure
    // the physics is supposed to avoid.
    // Mass matters: the same impact costs a 2.1 t SUV less speed than a
    // 1.3 t hatchback. The baseline (`heavy = 1`) reproduces the reference car
    // the tests were tuned against.
    const heavy = clamp(phys.mass / 1500, 0.75, 1.45);
    if (impact > 0.55) state.speed *= 1 - (0.75 * (impact - 0.55)) / 0.45 / heavy;
    if (impact > 0.9) state.speed *= Math.min(0.55, 0.3 * heavy);
  } else {
    state.sinceHit += dt;
  }

  const clamped = clampToWorld(env.bounds, state.x, state.z);
  const boundary = clamped.hit;
  if (boundary) {
    state.x = clamped.x;
    state.z = clamped.z;
    state.speed *= 0.4;
  }

  return { hit, boundary };
}

export type AdvanceResult = { substeps: number; hit: boolean; boundary: boolean; dtUsed: number };

/**
 * Frame-rate-independent advance: any frame delta is clamped and split into
 * `SUBSTEP` slices, so a 10 fps stutter or a 144 Hz display produces the same
 * trajectory within integrator error.
 */
export function advanceCar(
  state: CarState,
  frameDt: number,
  cmd: DriveCommand,
  env: DriveEnv
): AdvanceResult {
  const dt = clamp(frameDt, 0, 0.25);
  const substeps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / substeps;
  let hit = false;
  let boundary = false;
  for (let i = 0; i < substeps; i++) {
    const r = stepCar(state, h, cmd, env);
    hit = hit || r.hit;
    boundary = boundary || r.boundary;
  }
  return { substeps, hit, boundary, dtUsed: dt };
}

/** Per-frame visual body attitude (pitch/roll), derived — never part of the state. */
export function bodyAttitude(
  state: CarState,
  prevSpeed: number,
  dt: number,
  phys: VehiclePhysics = CAR
): { pitch: number; roll: number } {
  if (dt <= 0) return { pitch: 0, roll: 0 };
  const accel = (state.speed - prevSpeed) / dt;
  const lat = (state.speed * state.speed) / phys.wheelBase * Math.tan(state.steer);
  return {
    pitch: clamp(-accel * 0.004, -0.03, 0.03),
    roll: clamp(lat * 0.0035, -0.045, 0.045),
  };
}

export function moveTowards(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return target;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
