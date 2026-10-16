import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepVehicle,
  stepAutopilot,
  planRoute,
  colliders,
  isPointDrivable,
  footprintPoints,
  VEHICLE_RADIUS,
  type Vehicle,
  type Point2,
} from '../components/world/physics';
import { buildings, landmark, stations, spawn, type BuildingSpec } from '../components/world/world-layout';

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
const dt = 1 / 60;

function makeVehicle(x: number, z: number, yaw: number, speed = 0): Vehicle {
  return { x, z, yaw, speed, steer: 0, honkAge: 99 };
}

type Pose = { x: number; z: number; yaw: number };

function pointInsideBuilding(p: Point2, b: BuildingSpec): boolean {
  return Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.z - b.z) <= b.d / 2;
}

/**
 * A building is entered if ANY of the vehicle's collision samples falls inside it.
 * Uses the production `footprintPoints` (three circles along the heading) so the
 * tests exercise the real body shape instead of re-deriving a single circle.
 */
function insideFootprint(v: Pose, b: BuildingSpec): boolean {
  return footprintPoints(v.x, v.z, v.yaw).some((p) => pointInsideBuilding(p, b));
}

/** True if any body sample overlaps any solid collider, using the real footprint. */
function overlapsAny(v: Pose): boolean {
  const eps = 1e-3;
  for (const c of colliders) {
    for (const p of footprintPoints(v.x, v.z, v.yaw)) {
      if (c.type === 'circle') {
        if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + VEHICLE_RADIUS - eps) return true;
      } else {
        const dx = (p.x - c.x) - clamp(p.x - c.x, -c.hx, c.hx);
        const dz = (p.z - c.z) - clamp(p.z - c.z, -c.hz, c.hz);
        if (Math.hypot(dx, dz) < VEHICLE_RADIUS - eps) return true;
      }
    }
  }
  return false;
}

/** Drive a vehicle for `seconds` while asserting it never clips a building. */
function drive(v: Vehicle, command: () => { power: number; brake: boolean; steerCmd: number }, seconds: number, step = dt) {
  const frames = Math.round(seconds / step);
  let everInside = false;
  for (let i = 0; i < frames; i++) {
    stepVehicle(v, step, command(), null);
    if (buildings.some((b) => insideFootprint(v, b))) everInside = true;
  }
  return everInside;
}

test('spawn pose is clear of every solid collider', () => {
  assert.equal(overlapsAny(spawn), false, 'vehicle spawns inside/overlapping an obstacle');
  assert.equal(isPointDrivable(spawn.x, spawn.z, VEHICLE_RADIUS), true);
});

test('regression: driving straight at a building no longer enters it', () => {
  const building = buildings.find((b) => b.x === 21.4 && b.z === 4.2)!;
  const v = makeVehicle(0, building.z, Math.PI / 2); // facing +x, straight at the block
  const everInside = drive(v, () => ({ power: 1, brake: false, steerCmd: 0 }), 10);
  assert.equal(everInside, false, 'vehicle passed through the building');
  assert.ok(v.x <= building.x - building.w / 2 - 0.5, `vehicle stopped too close: x=${v.x.toFixed(2)}`);
});

test('cannot tunnel through a building at max speed with a large frame step', () => {
  const building = buildings.find((b) => b.x === 21.4 && b.z === 4.2)!;
  const v = makeVehicle(14, building.z, Math.PI / 2, 10);
  const everInside = drive(v, () => ({ power: 1, brake: false, steerCmd: 0 }), 6, 1 / 30);
  assert.equal(everInside, false, 'vehicle tunnelled through at high speed');
  assert.ok(v.x <= building.x - building.w / 2 - 0.5);
});

test('reversing moves the vehicle away from a wall instead of sticking', () => {
  const building = buildings.find((b) => b.x === 21.4 && b.z === 4.2)!;
  const v = makeVehicle(17.8, building.z, Math.PI / 2);
  const startX = v.x;
  const everInside = drive(v, () => ({ power: -1, brake: false, steerCmd: 0 }), 1.5);
  assert.equal(everInside, false);
  assert.ok(v.x < startX - 0.5, `vehicle did not reverse away (x=${v.x.toFixed(2)})`);
});

test('no building can be driven through, from any approach', () => {
  for (const b of buildings) {
    const alongX = Math.abs(b.x) >= Math.abs(b.z);
    const start = alongX
      ? { x: b.x + (b.x > 0 ? -1 : 1) * 6, z: b.z }
      : { x: b.x, z: b.z + (b.z > 0 ? -1 : 1) * 6 };
    const yaw = Math.atan2(b.x - start.x, b.z - start.z);
    const v = makeVehicle(start.x, start.z, yaw);
    const everInside = drive(v, () => ({ power: 1, brake: false, steerCmd: 0 }), 5);
    assert.equal(everInside, false, `drove through building at (${b.x}, ${b.z})`);
    assert.equal(insideFootprint(v, b), false);
  }
});

test('the central landmark is solid', () => {
  const v = makeVehicle(0, 12, Math.PI); // facing -z, straight at the centre
  drive(v, () => ({ power: 1, brake: false, steerCmd: 0 }), 5);
  const distance = Math.hypot(v.x - landmark.x, v.z - landmark.z);
  assert.ok(distance >= landmark.radius + VEHICLE_RADIUS - 0.05, `entered landmark (d=${distance.toFixed(2)})`);
});

test('the collision body is length-aware, not a single centre circle', () => {
  const b = buildings.find((spec) => spec.x === 21.4 && spec.z === 4.2)!;
  const wall = b.x - b.w / 2;
  // Centre is a full metre clear of the wall, but the nose sample reaches into it:
  // a single-circle model would report the pose as legal.
  const v = makeVehicle(wall - (VEHICLE_RADIUS + 1.0), b.z, Math.PI / 2);
  assert.equal(isPointDrivable(v.x, v.z, VEHICLE_RADIUS), true, 'centre should be clear');
  assert.equal(overlapsAny(v), true, 'the long nose should already be in contact');
});

test('steering cannot rotate the vehicle while it is stationary', () => {
  const v = makeVehicle(0, 9, Math.PI, 0);
  for (let i = 0; i < 60; i++) stepVehicle(v, dt, { power: 0, brake: false, steerCmd: 1 }, null);
  assert.ok(Math.abs(v.yaw - Math.PI) < 1e-9, 'vehicle spun on the spot');
});

test('the perimeter wall closes the gaps between buildings', () => {
  assert.equal(isPointDrivable(-13.2, 20, VEHICLE_RADIUS), false, 'former inter-building slot is still drivable');
  assert.equal(isPointDrivable(0, 18, VEHICLE_RADIUS), true, 'plaza should be drivable up to the wall');
  assert.equal(isPointDrivable(0, 18.5, VEHICLE_RADIUS), false, 'plaza should be bounded by the wall');
});

test('the car can always turn itself out of a corner', () => {
  const v = makeVehicle(-18, 18, 5.5);
  let maxSpeed = 0;
  for (let i = 0; i < 60 * 8; i++) {
    stepVehicle(v, dt, { power: 1, brake: false, steerCmd: 1 }, null);
    maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
  }
  assert.ok(maxSpeed > 3, `vehicle could not escape the corner (max speed ${maxSpeed.toFixed(2)})`);
});

test('steering turns the vehicle once it is moving', () => {
  const v = makeVehicle(0, 9, Math.PI, 0);
  for (let i = 0; i < 45; i++) stepVehicle(v, dt, { power: 1, brake: false, steerCmd: 1 }, null);
  assert.ok(v.speed > 0.5, `vehicle never gained speed (speed=${v.speed.toFixed(2)})`);
  assert.ok(Math.abs(v.yaw - Math.PI) > 0.1, 'vehicle did not turn while moving');
});

test('every destination is drivable and reachable from the spawn', () => {
  const clearance = VEHICLE_RADIUS + 0.1;
  const key = (x: number, z: number) => `${x},${z}`;
  const seen = new Set<string>([key(Math.round(spawn.x), Math.round(spawn.z))]);
  const queue: Point2[] = [{ x: spawn.x, z: spawn.z }];
  while (queue.length) {
    const current = queue.shift()!;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = Math.round(current.x + ox);
      const nz = Math.round(current.z + oz);
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (!isPointDrivable(nx, nz, clearance)) continue;
      seen.add(k);
      queue.push({ x: nx, z: nz });
    }
  }
  for (const station of stations) {
    assert.equal(isPointDrivable(station.x, station.z, clearance), true, `${station.label} is not drivable`);
    assert.equal(seen.has(key(Math.round(station.x), Math.round(station.z))), true, `${station.label} is unreachable`);
  }
});

test('autopilot reaches every station without clipping geometry', () => {
  for (const station of stations) {
    const route = planRoute({ x: spawn.x, z: spawn.z }, { x: station.x, z: station.z });
    assert.ok(route && route.length > 0, `no route planned to ${station.label}`);
    const v = makeVehicle(spawn.x, spawn.z, spawn.yaw);
    let index = 0;
    let reached = false;
    let clipped = false;
    for (let frame = 0; frame < 60 * 45; frame++) {
      while (index < route!.length - 1 && Math.hypot(v.x - route![index].x, v.z - route![index].z) < 1.25) index++;
      const waypoint = route![Math.min(index, route!.length - 1)];
      const { done } = stepAutopilot(v, dt, waypoint, index >= route!.length - 1);
      if (overlapsAny(v)) clipped = true;
      if (done) { reached = true; break; }
    }
    assert.equal(clipped, false, `autopilot clipped geometry en route to ${station.label}`);
    assert.equal(reached, true, `autopilot failed to reach ${station.label}`);
    assert.ok(Math.hypot(v.x - station.x, v.z - station.z) < 3, `autopilot stopped far from ${station.label}`);
  }
});

test('planning to a blocked destination reports failure instead of driving through it', () => {
  assert.equal(planRoute({ x: spawn.x, z: spawn.z }, { x: 0, z: 0 }), null);
});
