/**
 * Diagnostic: rebuild the runtime collision world and drive the real autopilot
 * from spawn to every stop. Not part of the shipped app; run manually with
 *   node scripts/diagnose-runtime-drive.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCollisionGrid, resolveCircle } from '../lib/world/collision.ts';
import { createCar } from '../lib/world/vehicle.ts';
import { placeProjectBuildings, clearProjectPlots, projectCollisionFootprints } from '../lib/world/project-buildings.ts';
import { buildFurniture, buildPropColliders, buildStreetLights } from '../lib/world/props.ts';
import { hydrateGraph } from '../lib/geo/graph.ts';
import { followRoute, planToStation } from '../lib/world/autopilot.ts';
import { stepDriveFsm, routeClearance, clearanceBehind } from '../lib/world/drive-fsm.ts';
import { advanceCar } from '../lib/world/vehicle.ts';
import { createFsmMemory } from '../lib/world/drive-fsm.ts';
import type { BuildingChunk, GraphPayload, WorldData } from '../lib/world/types.ts';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const world = JSON.parse(fs.readFileSync(path.join(dataDir, 'lagos-world.json'), 'utf8')) as WorldData;
const graph = hydrateGraph(JSON.parse(fs.readFileSync(path.join(dataDir, 'lagos-graph.json'), 'utf8')) as GraphPayload);

const chunks: BuildingChunk[] = [];
for (let row = 0; row < world.meta.chunks; row++) {
  for (let col = 0; col < world.meta.chunks; col++) {
    const p = path.join(dataDir, `lagos-buildings-${row}${col}.json`);
    if (fs.existsSync(p)) chunks.push(JSON.parse(fs.readFileSync(p, 'utf8')) as BuildingChunk);
  }
}
const all = chunks.flatMap((c) => c.b);
const roadHalfWidth = Math.max(6, ...world.stations.map((s) => (s.roadWidth ?? 12) / 2));
const projects = placeProjectBuildings(world.stations, all.map((b) => b.p), {
  roadHalfWidth,
  playable: world.meta.playable!.world,
});
const cleared = clearProjectPlots(all.map((b) => b.p), projects);
const lights = buildStreetLights(world.roads, world.lights);
const furniture = buildFurniture(world.roads, world.stations).filter(
  (f) => !world.stations.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 18)
);
const grid = createCollisionGrid([
  ...cleared.footprints,
  ...projectCollisionFootprints(projects),
  ...buildPropColliders(furniture, lights, world.signals ?? []),
]);

const spawn = world.spawn!;
const bounds = world.meta.worldBounds;
console.log('colliders', grid.count, 'spawn', spawn);
console.log('spawn overlap', resolveCircle(grid, spawn.x, spawn.z, 1.1));

for (const station of world.stations) {
  if (station.zone === 'home') continue;
  const car = createCar(spawn);
  const plan = planToStation(graph, car, station);
  if (!plan.ok) { console.log(station.zone, 'PLAN FAIL', plan.message); continue; }
  const route = plan.route.p;
  const fsm = createFsmMemory();
  let cursor = 0;
  let arrived = false;
  let state = '';
  let blockedAt = 0;
  let minAhead = Infinity;
  let lastState = '';
  for (let i = 0; i < 60 * 120 && !arrived; i++) {
    const ahead = routeClearance(route, cursor, grid);
    const behind = clearanceBehind(grid, car);
    if (i === 0) console.log(station.zone, 'start ahead', ahead.toFixed(2), 'behind', behind.toFixed(2));
    const result = stepDriveFsm(route, car, fsm, 1 / 60, { ahead, behind, boundary: 999 });
    cursor = result.cursor;
    state = result.state;
    minAhead = Math.min(minAhead, ahead);
    arrived = result.arrived;
    if (result.state !== lastState) {
      lastState = result.state;
      if (station.zone === 'project:proofmesh') {
        console.log(
          `  ${(i / 60).toFixed(1)}s ${result.state} at ${car.x.toFixed(1)},${car.z.toFixed(1)} ` +
          `yaw ${car.yaw.toFixed(2)} speed ${car.speed.toFixed(2)} ahead ${ahead.toFixed(1)} behind ${behind.toFixed(1)} cursor ${cursor}`
        );
      }
    }
    if (result.state === 'SAFE_FAILURE') { blockedAt = i; break; }
    advanceCar(car, 1 / 60, result.command, { grid, bounds });
  }
  console.log(
    station.zone,
    arrived ? 'ARRIVED' : `stopped state=${state} at ${car.x.toFixed(1)},${car.z.toFixed(1)} after ${(blockedAt / 60).toFixed(1)}s minAhead=${minAhead.toFixed(2)}`
  );
}
