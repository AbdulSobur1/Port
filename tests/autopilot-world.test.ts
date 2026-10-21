import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hydrateGraph } from '../lib/geo/graph.ts';
import { followRoute, planToStation } from '../lib/world/autopilot.ts';
import { advanceCar, createCar } from '../lib/world/vehicle.ts';
import { createCollisionGrid } from '../lib/world/collision.ts';
import type { BuildingChunk, GraphPayload, WorldData } from '../lib/world/types.ts';

/**
 * Drive the actual shipped world with the actual autopilot, at 60 Hz, against
 * the actual building collision grid. Planning a route is not enough: this is
 * the check that catches a route which is geometrically valid but physically
 * blocked by a wall, a kerb of parked geometry or a turn the car cannot make.
 */

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const world = JSON.parse(fs.readFileSync(path.join(dataDir, 'lagos-world.json'), 'utf8')) as WorldData;
const payload = JSON.parse(fs.readFileSync(path.join(dataDir, 'lagos-graph.json'), 'utf8')) as GraphPayload;
const graph = hydrateGraph(payload);

const footprints: number[][] = [];
for (let row = 0; row < world.meta.chunks; row++) {
  for (let col = 0; col < world.meta.chunks; col++) {
    const file = `lagos-buildings-${row}${col}.json`;
    if (!fs.existsSync(path.join(dataDir, file))) continue;
    const chunk = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) as BuildingChunk;
    for (const b of chunk.b) footprints.push(b.p);
  }
}
const grid = createCollisionGrid(footprints);
const bounds = world.meta.worldBounds;

test('autopilot drives to every destination without a collision deadlock', () => {
  assert.ok(world.spawn);
  const spawn = world.spawn!;

  for (const station of world.stations) {
    if (station.zone === 'home') continue;
    const car = createCar({ x: spawn.x, z: spawn.z, yaw: spawn.yaw });
    const plan = planToStation(graph, car, station);
    assert.ok(plan.ok, `${station.label}: ${plan.ok ? '' : plan.message}`);
    if (!plan.ok) continue;

    let cursor = 0;
    let arrived = false;
    let stuckSeconds = 0;
    let lastX = car.x;
    let lastZ = car.z;
    const dt = 1 / 60;
    const maxSeconds = 150;

    for (let step = 0; step < maxSeconds * 60 && !arrived; step++) {
      const result = followRoute(plan.route.p, car, cursor, stuckSeconds);
      cursor = result.cursor;
      arrived = result.arrived;
      const move = advanceCar(car, dt, result.command, { grid, bounds });
      const travelled = Math.hypot(car.x - lastX, car.z - lastZ);
      lastX = car.x;
      lastZ = car.z;
      // Accumulate time with no meaningful progress while asking for throttle.
      if (travelled < 0.01 && result.command.throttle > 0.05) stuckSeconds += dt;
      else stuckSeconds = 0;
      if (move.boundary) assert.fail(`${station.label}: hit the world boundary`);
    }

    assert.ok(arrived, `${station.label}: autopilot did not arrive (${car.x.toFixed(1)}, ${car.z.toFixed(1)})`);
    const gap = Math.hypot(car.x - station.x, car.z - station.z);
    assert.ok(gap < 10, `${station.label}: stopped ${gap.toFixed(1)} m from the marker`);
  }
});
