import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionGrid } from '../lib/world/collision.ts';
import { advanceCar, createCar, type DriveCommand } from '../lib/world/vehicle.ts';
import { buildPropColliders, rectRing, type Furniture } from '../lib/world/props.ts';
import { placeProjectBuildings } from '../lib/world/project-buildings.ts';
import type { StationData } from '../lib/world/types.ts';

const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const drive: DriveCommand = { throttle: 1, brake: 0, steer: 0 };

function stopBefore(grid: ReturnType<typeof createCollisionGrid>, obstacleZ: number): number {
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  for (let i = 0; i < 60 * 8; i++) {
    advanceCar(car, 1 / 60, drive, { grid, bounds });
  }
  assert.ok(car.z < obstacleZ, `car reached z=${car.z.toFixed(2)} past the obstacle at ${obstacleZ}`);
  assert.ok(car.z > obstacleZ - 5, `car stopped unreasonably far away at z=${car.z.toFixed(2)}`);
  return car.z;
}

test('a bench on the verge is solid', () => {
  const bench: Furniture = { x: 0, z: 12, yaw: 0, kind: 'bench' };
  const grid = createCollisionGrid(buildPropColliders([bench], [], []));
  stopBefore(grid, 12);
});

test('a lamp post and a signal post are solid', () => {
  const lampGrid = createCollisionGrid(buildPropColliders([], [[0, 12, 1]], []));
  stopBefore(lampGrid, 12);
  const signalGrid = createCollisionGrid(buildPropColliders([], [], [0, 12]));
  stopBefore(signalGrid, 12);
});

test('rect helper produces a valid CCW footprint', () => {
  const ring = rectRing(0, 0, 2, 4, Math.PI / 4);
  assert.equal(ring.length, 8);
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area2 += ring[2 * i] * ring[2 * j + 1] - ring[2 * j] * ring[2 * i + 1];
  }
  assert.ok(area2 > 0, `ring should be counter-clockwise, got ${area2}`);
  assert.ok(Math.abs(Math.abs(area2) / 2 - 8) < 0.01, `area ${Math.abs(area2) / 2}`);
});

function station(): StationData {
  return {
    zone: 'project:test',
    label: 'Test',
    x: 0,
    z: 0,
    heading: 0,
    node: 1,
    nodeIndex: 0,
    toNode: 2,
    road: 'Adeniji Adele Road',
    roadClass: 'unclassified',
    roadWidth: 6,
    snapDistance: 0,
    anchor: { lat: 0, lng: 0 },
  };
}

test('a project building and its parked cars are solid', () => {
  const [building] = placeProjectBuildings([station()], [], {
    playable: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    roadHalfWidth: 3,
    frontOffset: 15,
  });
  assert.ok(building, 'no building was placed');
  assert.equal(building.parked.length, 2);
  // The building is 15 m from the centreline on one side; its parked cars sit
  // about 12.4 m out. Drive at the parked car and confirm the car stops.
  const car = building.parked[0];
  const grid = createCollisionGrid([building.footprint, car.footprint]);
  const testCar = createCar({ x: car.x, z: car.z - 30, yaw: 0 });
  for (let i = 0; i < 60 * 8; i++) {
    advanceCar(testCar, 1 / 60, drive, { grid, bounds });
  }
  assert.ok(testCar.z < car.z + 1.5, `car drove through the parked car to z=${testCar.z.toFixed(1)}`);
  assert.ok(Math.abs(testCar.speed) < 8, `impact should slow the car, speed=${testCar.speed.toFixed(1)}`);
});
