import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionGrid } from '../lib/world/collision.ts';
import {
  advanceCar,
  createCar,
  maxSteerAtSpeed,
  CAR,
  type DriveCommand,
  type DriveEnv,
} from '../lib/world/vehicle.ts';

const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
const emptyGrid = createCollisionGrid([]);

function env(grid = emptyGrid, box = bounds): DriveEnv {
  return { grid, bounds: box };
}

const throttle: DriveCommand = { throttle: 1, brake: 0, steer: 0 };

function run(hz: number, seconds: number, cmd: DriveCommand, car = createCar({ x: 0, z: 0, yaw: 0 }), e = env()) {
  const dt = 1 / hz;
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) advanceCar(car, dt, cmd, e);
  return car;
}

test('same input at 30, 60 and 144 Hz converges on the same trajectory', () => {
  const a = run(30, 4, throttle);
  const b = run(60, 4, throttle);
  const c = run(144, 4, throttle);
  assert.ok(Math.abs(a.z - b.z) < 0.25, `30 vs 60: ${a.z} vs ${b.z}`);
  assert.ok(Math.abs(c.z - b.z) < 0.25, `144 vs 60: ${c.z} vs ${b.z}`);
  assert.ok(Math.abs(a.z - c.z) < 0.35, `30 vs 144: ${a.z} vs ${c.z}`);
  assert.ok(b.z > 20, `car should have travelled, z=${b.z}`);
});

test('one huge frame does not teleport the car through a wall', () => {
  const grid = createCollisionGrid([[-6, 20, 6, 20, 6, 26, -6, 26]]);
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  car.speed = CAR.maxSpeed;
  // 400 ms at full speed = ~10.8 m; the wall is at z=20 with 1 m radius offset.
  advanceCar(car, 0.4, throttle, env(grid));
  assert.ok(car.z < 20, `car tunnelled to z=${car.z}`);
});

test('collision stops the car at a building instead of passing through', () => {
  const grid = createCollisionGrid([[-6, 20, 6, 20, 6, 40, -6, 40]]);
  const car = run(60, 8, throttle, createCar({ x: 0, z: 0, yaw: 0 }), env(grid));
  assert.ok(car.z < 20 - CAR.circleRadius + 1.7, `z=${car.z} should be blocked before the wall`);
  assert.ok(Math.abs(car.speed) < CAR.maxSpeed * 0.6, `speed should drop on impact, got ${car.speed}`);
});

test('sliding along a wall keeps the car moving forward', () => {
  const grid = createCollisionGrid([[2, 0, 6, 0, 6, 60, 2, 60]]);
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  const cmd = { throttle: 0.8, brake: 0, steer: 0.35 };
  run(60, 5, cmd, car, env(grid));
  assert.ok(car.z > 8, `should slide along the wall, z=${car.z}`);
});

test('world boundary clamps position and reduces speed', () => {
  const car = run(60, 6, throttle, createCar({ x: 0, z: 0, yaw: 0 }), env(emptyGrid, { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }));
  assert.ok(car.z <= 20 - 12 + 0.001, `z=${car.z}`);
  assert.ok(Math.abs(car.speed) < CAR.maxSpeed);
});

test('braking brings the car to rest and reverse engages afterwards', () => {
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  car.speed = 12;
  const stopped = run(60, 3, { throttle: 0, brake: 1, steer: 0 }, car);
  assert.ok(Math.abs(stopped.speed) < 0.2, `speed ${stopped.speed}`);
  const stoppedZ = stopped.z;
  const reversed = run(60, 2, { throttle: -1, brake: 0, steer: 0 }, stopped);
  assert.ok(reversed.speed < -1, `reverse speed ${reversed.speed}`);
  assert.ok(reversed.z < stoppedZ, 'reverse should move backwards');
});

test('steering lock tightens with speed, so the turn radius grows', () => {
  assert.ok(maxSteerAtSpeed(0) > maxSteerAtSpeed(20));
  const slow = createCar({ x: 0, z: 0, yaw: 0 });
  slow.speed = 5;
  run(60, 1, { throttle: 0.3, brake: 0, steer: 1 }, slow);
  const fast = createCar({ x: 0, z: 0, yaw: 0 });
  fast.speed = 25;
  run(60, 1, { throttle: 0.3, brake: 0, steer: 1 }, fast);
  const slowRadius = 5 / Math.abs(slow.yaw || 1e-6);
  const fastRadius = 25 / Math.abs(fast.yaw || 1e-6);
  assert.ok(fastRadius > slowRadius * 1.6, `radii slow=${slowRadius.toFixed(1)} fast=${fastRadius.toFixed(1)}`);
});

test('inactive input coasts to a stop', () => {
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  car.speed = 15;
  run(60, 22, { throttle: 0, brake: 0, steer: 0 }, car);
  assert.ok(Math.abs(car.speed) < 0.15, `coasting speed ${car.speed}`);
});

test('steering angle recentres when input released', () => {
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  car.speed = 10;
  run(60, 0.5, { throttle: 0.4, brake: 0, steer: 1 }, car);
  assert.ok(car.steer > 0.05);
  run(60, 1.5, { throttle: 0.4, brake: 0, steer: 0 }, car);
  assert.ok(Math.abs(car.steer) < 0.02, `steer ${car.steer}`);
});
