import fs from 'node:fs';
import { hydrateGraph } from '../lib/geo/graph.ts';
import { planToStation } from '../lib/world/autopilot.ts';
const w=JSON.parse(fs.readFileSync('./public/data/lagos-world.json'));
const g=hydrateGraph(JSON.parse(fs.readFileSync('./public/data/lagos-graph.json')));
let fail=0;
for(const from of w.stations){
  for(const to of w.stations){
    if(from.zone===to.zone) continue;
    const r=planToStation(g,{x:from.x,z:from.z,yaw:from.heading},to);
    if(!r.ok){console.log('FAIL',from.zone,'->',to.zone,r.reason,r.message);fail++;}
  }
}
console.log('failures',fail);
