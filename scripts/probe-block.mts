import fs from 'node:fs';
import path from 'node:path';
import { createCollisionGrid, footprintCollider, resolveCircle } from '../lib/world/collision.ts';
import { placeProjectBuildings, clearProjectPlots, projectCollisionFootprints } from '../lib/world/project-buildings.ts';
import { buildFurniture, buildPropColliders, buildStreetLights } from '../lib/world/props.ts';
import { hydrateGraph } from '../lib/geo/graph.ts';
import { planToStation } from '../lib/world/autopilot.ts';
import { createCar } from '../lib/world/vehicle.ts';
import type { BuildingChunk, GraphPayload, WorldData } from '../lib/world/types.ts';
const world = JSON.parse(fs.readFileSync('public/data/lagos-world.json','utf8')) as WorldData;
const graph = hydrateGraph(JSON.parse(fs.readFileSync('public/data/lagos-graph.json','utf8')) as GraphPayload);
const chunks: BuildingChunk[] = [];
for (let r=0;r<3;r++) for (let c=0;c<3;c++) { const p=`public/data/lagos-buildings-${r}${c}.json`; if (fs.existsSync(p)) chunks.push(JSON.parse(fs.readFileSync(p,'utf8'))); }
const all = chunks.flatMap(c=>c.b);
const projects = placeProjectBuildings(world.stations, all.map(b=>b.p), { roadHalfWidth: 6, playable: world.meta.playable!.world });
const cleared = clearProjectPlots(all.map(b=>b.p), projects);
const lights = buildStreetLights(world.roads, world.lights);
const furniture = buildFurniture(world.roads, world.stations).filter(f=>!world.stations.some(s=>Math.hypot(s.x-f.x,s.z-f.z)<18));
const sets: Record<string, number[][]> = {
  osm: cleared.footprints,
  projects: projectCollisionFootprints(projects),
  props: buildPropColliders(furniture, lights, world.signals ?? []),
};
const grid = createCollisionGrid([...sets.osm, ...sets.projects, ...sets.props]);
const car = createCar(world.spawn!);
const station = world.stations.find(s=>s.zone==='project:proofmesh')!;
const plan = planToStation(graph, car, station)!;
if (!plan.ok) throw new Error(plan.message);
const p = plan.route.p;
console.log('route length', Math.round(p.length/2));
for (let i=0;i<Math.min(10,p.length);i+=2) console.log(' pt', i/2, p[i].toFixed(1), p[i+1].toFixed(1));
for (const pos of [[-289.5,197.8],[-216.3,166.2]]) {
  console.log('pos', pos, 'hit', resolveCircle(grid,pos[0],pos[1],1.05));
  for (const [name,list] of Object.entries(sets)) {
    for (const fp of list) {
      const c = footprintCollider(fp); if (!c) continue;
      const d = resolveCircle(createCollisionGrid([fp]), pos[0], pos[1], 1.6);
      if (d.hit) console.log('  blocked by', name, JSON.stringify(c), 'depth', d.depth.toFixed(2));
    }
  }
}
console.log('projects', projects.map(b=>({zone:b.zone,x:Math.round(b.x),z:Math.round(b.z),side:b.side,front:b.frontOffset})));
