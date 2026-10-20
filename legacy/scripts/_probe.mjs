import fs from 'node:fs';
import { hydrateGraph } from '../lib/geo/graph.ts';
const w=JSON.parse(fs.readFileSync('./public/data/lagos-world.json'));
const g=hydrateGraph(JSON.parse(fs.readFileSync('./public/data/lagos-graph.json')));
const play=w.meta.playable.world;
const inside=(x,z)=>x>=play.minX&&x<=play.maxX&&z>=play.minZ&&z<=play.maxZ;
const byName={};
for(const e of g.edges){const k=e.name||'';if(!byName[k])byName[k]=[];byName[k].push(e);}
for(const [k,list] of Object.entries(byName)){
 const tot=list.reduce((a,e)=>a+e.len,0); if(tot>300) console.log(k, list.length, Math.round(tot));
}
console.log('--- Adeniji edges ---');
const ad=byName['Adeniji Adele Road']||[];
for(const [i,e] of ad.entries()){
 const a=g.nodes[e.a],b=g.nodes[e.b];
 console.log(i,'len',Math.round(e.len),'a',Math.round(a.x),Math.round(a.z),'b',Math.round(b.x),Math.round(b.z),'oneway',e.oneway,'in',inside(a.x,a.z)&&inside(b.x,b.z),e.cls);
}
console.log('playable', JSON.stringify(play));
