import * as THREE from 'three';
import type { Station } from './store';

// Playable half-extent and static obstacle list (also referenced by city.tsx for visuals).
export const worldBounds = 24;
export const colliders: { x: number; z: number; r: number }[] = [
  { x: 0, z: 0, r: 3.2 }, // center landmark pedestal
  { x: 7.2, z: 7.2, r: 1.2 },
  { x: 10.5, z: 6.8, r: 1.1 },
  { x: -7.5, z: 7.5, r: 1.2 },
  { x: -10.8, z: 6.2, r: 1.1 },
  { x: -7.0, z: -8.0, r: 1.3 },
  { x: -10.2, z: -7.5, r: 1.1 },
  { x: 7.0, z: -8.0, r: 1.2 },
  { x: 10.2, z: -7.5, r: 1.1 },
];

const MAX_SPEED = 14;
const REVERSE = 5;
const ACCEL = 22;
const BRAKE_DECEL = 34;
const STEER_RATE = 2.6;
const STEER_RETURN = 8;
const DRAG = 5.5;

export type Vehicle = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  honkAge: number;
};

export function stepVehicle(
  v: Vehicle,
  dt: number,
  command: { power: number; brake: boolean; steerCmd: number },
  nearestStation: Station | null
) {
  v.honkAge = Math.min(99, v.honkAge + dt);

  // --- longitudinal ---
  if (command.brake) {
    const decel = BRAKE_DECEL * dt;
    v.speed = v.speed > 0 ? Math.max(0, v.speed - decel) : Math.min(0, v.speed + decel);
  } else if (command.power > 0) {
    v.speed = Math.min(MAX_SPEED, v.speed + ACCEL * dt);
  } else if (command.power < 0) {
    v.speed = Math.max(-REVERSE, v.speed - ACCEL * dt);
  } else {
    const drag = DRAG * dt;
    v.speed = v.speed > 0 ? Math.max(0, v.speed - drag) : Math.min(0, v.speed + drag);
  }

  // --- steering ---
  const target = command.steerCmd;
  if (Math.abs(target) > 0.01) {
    v.steer += Math.sign(target - v.steer) * STEER_RATE * dt;
    v.steer = THREE.MathUtils.clamp(v.steer, -1, 1);
  } else {
    // wheel auto-centers
    const back = STEER_RETURN * dt;
    v.steer = Math.abs(v.steer) < back ? 0 : v.steer - Math.sign(v.steer) * back;
  }

  const grip = Math.min(1, Math.abs(v.speed) / 3.5); // low speed = gentler turn-in
  const direction = v.speed >= 0 ? 1 : -1;
  v.yaw -= v.steer * STEER_YAW_RATE * grip * direction * dt;

  // --- integrate ---
  v.x += Math.sin(v.yaw) * v.speed * dt;
  v.z += Math.cos(v.yaw) * v.speed * dt;

  // --- bounds ---
  v.x = THREE.MathUtils.clamp(v.x, -worldBounds, worldBounds);
  v.z = THREE.MathUtils.clamp(v.z, -worldBounds, worldBounds);

  // --- static colliders ---
  for (const c of colliders) {
    const dx = v.x - c.x;
    const dz = v.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist < c.r) {
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      v.x = c.x + nx * c.r;
      v.z = c.z + nz * c.r;
      // absorb some of the impact into the surface
      v.speed *= 0.4;
    }
  }

  // park the vehicle softly at the station it is visiting
  if (nearestStation) {
    const dx = v.x - nearestStation.x;
    const dz = v.z - nearestStation.z;
    const dist = Math.hypot(dx, dz);
    const keep = nearestStation.radius * 0.85;
    if (dist < keep) {
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      v.x = nearestStation.x + nx * keep;
      v.z = nearestStation.z + nz * keep;
      v.speed *= 0.85;
    }
  }
}

const STEER_YAW_RATE = 1.9;

// --- Autopilot: a simple seek + brake-at-target driver used for guided navigation ---
export function stepAutopilot(v: Vehicle, dt: number, target: { x: number; z: number }): {
  done: boolean;
} {
  const dx = target.x - v.x;
  const dz = target.z - v.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 1.2) {
    v.speed = Math.max(0, v.speed - BRAKE_DECEL * dt);
    return { done: v.speed < 0.05 };
  }

  // desired heading
  const desired = Math.atan2(dx, dz);
  let diff = desired - v.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  // steer proportional to heading error, clamped
  const steerCmd = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
  stepVehicle(v, dt, { power: dist > 8 ? 1 : 0.45, brake: false, steerCmd }, null);
  return { done: false };
}
