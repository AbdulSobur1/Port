import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteGraph, type RoadInput } from '../lib/geo/graph.ts';
import { followRoute, planToStation, projectProgress, routeLength, curveSpeed } from '../lib/world/autopilot.ts';
import { advanceCar, createCar, type CarState } from '../lib/world/vehicle.ts';
import { createCollisionGrid } from '../lib/world/collision.ts';
import type { StationData } from '../lib/world/types.ts';

const env = { grid: createCollisionGrid([]), bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 } };

function straightGraph(): { graph: ReturnType<typeof buildRouteGraph>; station: StationData } {
  const roads: RoadInput[] = [
    {
      id: 1, cls: 'secondary', name: 'Marina', width: 10, oneway: 0, drivable: true, speed: 12,
      refs: [1, 2, 3], pts: [0, 0, 0, 120, 0, 240],
    },
  ];
  const graph = buildRouteGraph(roads);
  const station: StationData = {
    zone: 'project:test', label: 'Test', x: 0, z: 240, heading: 0,
    node: 3, nodeIndex: graph.index.get(3)!, toNode: 2,
    road: 'Marina', roadClass: 'secondary', snapDistance: 0,
    anchor: { lat: 0, lng: 0 },
  };
  return { graph, station };
}

test('planning a route on a straight road returns the road geometry', () => {
  const { graph, station } = straightGraph();
  const car = createCar({ x: 0, z: 2, yaw: 0 });
  const plan = planToStation(graph, car, station);
  if (!plan.ok) assert.fail(plan.message);
  if (!plan.ok) return;
  assert.ok(plan.route.length > 200);
  assert.ok(plan.route.p.length >= 6);
});

test('planning fails honestly when the destination is on another network', () => {
  const roads: RoadInput[] = [
    { id: 1, cls: 'residential', name: 'A', width: 6, oneway: 0, drivable: true, speed: 8, refs: [1, 2], pts: [0, 0, 0, 100] },
    { id: 2, cls: 'residential', name: 'B', width: 6, oneway: 0, drivable: true, speed: 8, refs: [3, 4], pts: [800, 800, 800, 900] },
  ];
  const graph = buildRouteGraph(roads);
  const station: StationData = {
    zone: 'project:far', label: 'Far', x: 800, z: 900, heading: 0,
    node: 4, nodeIndex: graph.index.get(4)!, toNode: 3,
    road: 'B', roadClass: 'residential', snapDistance: 0, anchor: { lat: 0, lng: 0 },
  };
  const plan = planToStation(graph, createCar({ x: 0, z: 0, yaw: 0 }), station);
  assert.ok(!plan.ok);
  if (!plan.ok) assert.equal(plan.reason, 'disconnected');
});

function driveToStation(seconds = 45): { car: CarState; arrived: boolean; minX: number; maxX: number; progress: number } {
  const { graph, station } = straightGraph();
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  const plan = planToStation(graph, car, station);
  if (!plan.ok) throw new Error(plan.message);

  let cursor = 0;
  let arrived = false;
  let minX = 0;
  let maxX = 0;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60 && !arrived; i++) {
    const result = followRoute(plan.route.p, car, cursor, 0);
    cursor = result.cursor;
    arrived = result.arrived;
    advanceCar(car, dt, result.command, env);
    minX = Math.min(minX, car.x);
    maxX = Math.max(maxX, car.x);
  }
  return { car, arrived, minX, maxX, progress: cursor };
}

test('autopilot follows the road and arrives at the destination', () => {
  const { car, arrived, minX, maxX } = driveToStation();
  assert.ok(arrived, `did not arrive, ended at z=${car.z.toFixed(1)}`);
  assert.ok(car.z > 225, `ended too far from the station: z=${car.z}`);
  // The road is straight at x=0; the car must not wander into the verge.
  assert.ok(maxX < 4 && minX > -4, `lateral drift ${minX}..${maxX}`);
});

test('autopilot never exceeds a sane speed for the road', () => {
  const { graph, station } = straightGraph();
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  const plan = planToStation(graph, car, station);
  assert.ok(plan.ok);
  if (!plan.ok) return;
  let cursor = 0;
  let maxSpeed = 0;
  for (let i = 0; i < 60 * 20; i++) {
    const result = followRoute(plan.route.p, car, cursor, 0);
    cursor = result.cursor;
    advanceCar(car, 1 / 60, result.command, env);
    maxSpeed = Math.max(maxSpeed, Math.abs(car.speed));
  }
  assert.ok(maxSpeed < 20, `speed ${maxSpeed}`);
});

test('progress is monotonic and bounded by the route length', () => {
  const route = [0, 0, 0, 100, 100, 100];
  const total = routeLength(route);
  assert.ok(Math.abs(total - 200) < 1e-6);
  const a = projectProgress(route, 0, 10, 0);
  const b = projectProgress(route, 60, 100, a.s);
  assert.ok(a.s < b.s);
  assert.ok(b.s <= total + 1e-6);
});

test('curve speed drops approaching a corner and stays high on a straight', () => {
  const straight = [0, 0, 0, 120];
  // 90° corner 12 m ahead, then a straight run.
  const bend = [0, 0, 0, 12, 12, 12, 24, 12, 36, 12, 48, 12];
  assert.ok(curveSpeed(straight, 0, 40, 4.6) > 30);
  assert.ok(curveSpeed(bend, 0, 40, 4.6) < curveSpeed(straight, 0, 40, 4.6));
  assert.ok(curveSpeed(bend, 0, 40, 4.6) < 16, 'a 90° corner should force a slow approach');
});
