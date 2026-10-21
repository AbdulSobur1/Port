import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionGrid } from '../lib/world/collision.ts';
import { advanceCar, createCar } from '../lib/world/vehicle.ts';
import {
  clearanceBehind,
  createFsmMemory,
  routeClearance,
  stepDriveFsm,
  type AutoState,
} from '../lib/world/drive-fsm.ts';

const route = [0, 0, 0, 140];
const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

function wall(z: number, width = 7): number[] {
  return [-width, z, width, z, width, z + 2, -width, z + 2];
}

type Run = {
  states: AutoState[];
  car: ReturnType<typeof createCar>;
  memory: ReturnType<typeof createFsmMemory>;
  arrived: boolean;
  minZ: number;
  maxZ: number;
};

function run(
  grid: ReturnType<typeof createCollisionGrid>,
  startZ: number,
  seconds = 30
): Run {
  const car = createCar({ x: 0, z: startZ, yaw: 0 });
  const memory = createFsmMemory();
  // The route hint at the starting position.
  memory.bestProgress = startZ;
  const states: AutoState[] = [];
  let arrived = false;
  let minZ = startZ;
  let maxZ = startZ;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const ahead = routeClearance(route, memory.bestProgress, grid);
    const result = stepDriveFsm(route, car, memory, dt, {
      ahead,
      behind: clearanceBehind(grid, car),
      boundary: Math.min(bounds.maxZ - car.z, 500),
      reason: ahead < 3.5 ? 'obstacle' : undefined,
    });
    if (states[states.length - 1] !== result.state) states.push(result.state);
    arrived = result.arrived;
    advanceCar(car, dt, result.command, { grid, bounds });
    minZ = Math.min(minZ, car.z);
    maxZ = Math.max(maxZ, car.z);
    if (arrived || result.state === 'SAFE_FAILURE') break;
  }
  return { states, car, memory, arrived, minZ, maxZ };
}

test('clear road: autopilot follows and arrives without entering recovery', () => {
  const grid = createCollisionGrid([]);
  const result = run(grid, 0, 40);
  assert.ok(result.arrived, `did not arrive, z=${result.car.z.toFixed(1)}`);
  assert.ok(!result.states.includes('REVERSE_RECOVERY'), result.states.join(' → '));
  assert.ok(!result.states.includes('SAFE_FAILURE'), result.states.join(' → '));
});

test('blocked road: car stops, reverses when clear, then tries to rejoin', () => {
  const grid = createCollisionGrid([wall(60)]);
  const result = run(grid, 30, 35);
  const seq = result.states.join(' → ');
  assert.ok(result.states.includes('STOP_FOR_OBSTACLE') || result.states.includes('SLOW_DOWN'), seq);
  assert.ok(result.states.includes('WAIT_OR_REPLAN'), seq);
  assert.ok(result.states.includes('REVERSE_RECOVERY'), seq);
  assert.ok(result.states.includes('REORIENT'), seq);
  assert.ok(result.car.z < 60, `car penetrated the wall: z=${result.car.z}`);
  assert.ok(result.maxZ - result.car.z > 1.5, `the reversal should move the car back from its furthest point (max ${result.maxZ.toFixed(1)}, end ${result.car.z.toFixed(1)})`);
});

test('no room behind: stops safely instead of reversing blindly', () => {
  // Box the car in: front bumper at 45.2, rear bumper at 40.8.
  const grid = createCollisionGrid([wall(47), wall(37)]);
  const result = run(grid, 43, 20);
  const seq = result.states.join(' → ');
  assert.ok(!result.states.includes('REVERSE_RECOVERY'), seq);
  assert.ok(result.states.includes('SAFE_FAILURE'), seq);
  assert.ok(Math.abs(result.car.speed) < 0.5, `car should be stopped, speed=${result.car.speed}`);
  assert.ok(result.car.z > 37 && result.car.z < 47, `car ended at z=${result.car.z}`);
});

test('recovery is bounded: repeated blocks end in SAFE_FAILURE, not oscillation', () => {
  const grid = createCollisionGrid([wall(60)]);
  const result = run(grid, 30, 40);
  assert.ok(result.memory.attempts <= 2, `attempts=${result.memory.attempts}`);
  assert.ok(result.states.length < 20, `state churn: ${result.states.join(' → ')}`);
  assert.ok(
    result.states[result.states.length - 1] === 'SAFE_FAILURE' || result.arrived,
    `ended in ${result.states[result.states.length - 1]}`
  );
});
