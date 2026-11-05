#!/usr/bin/env node
/**
 * Place every portfolio stop on its street, without re-parsing the PBF.
 *
 *   node scripts/place-streets.mjs
 *
 * Each district in lib/works.ts names a real OpenStreetMap street. This finds
 * the longest connected run of that street inside the playable box and spaces
 * that district's stops along it. Rewrites only `stations`, `spawn`,
 * `mainStreet` and `districts` in public/data/lagos-world.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjection } from '../lib/geo/projection.ts';
import { hydrateGraph, snapToGraph } from '../lib/geo/graph.ts';
import { longestStreetChain, placeStationsAlong, streetAddress, reverseFlat } from '../lib/world/main-street.ts';
import { districts, streetPlan, works, pageStops } from '../lib/works.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const worldFile = path.join(DATA, 'lagos-world.json');
const world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
const payload = JSON.parse(fs.readFileSync(path.join(DATA, 'lagos-graph.json'), 'utf8'));
const graph = hydrateGraph(payload);
const playable = world.meta.playable.world;
const projection = createProjection(world.meta.bounds);

const labelOf = (zone) => {
  if (zone.startsWith('project:')) return works.find((w) => `project:${w.slug}` === zone).title;
  return pageStops.find((p) => p.zone === zone).title;
};

const stations = [];
const outDistricts = [];
let spawn = null;
let mainStreet = null;

for (const plan of streetPlan) {
  const district = districts.find((d) => d.id === plan.district);
  const chain = longestStreetChain(payload.edges, district.street, playable);
  if (!chain) { console.error(`No continuous ${district.street} in the playable area.`); process.exit(1); }
  // Orient the chain with the traffic when its edges are one-way.
  let forward = 0, backward = 0;
  for (const ei of chain.edgeIds) {
    const e = payload.edges[ei];
    if (!e.oneway) continue;
    const mid = e.p;
    // chain.p runs in chain order; edge a->b is traffic direction.
    const startsAtA = Math.hypot(mid[0] - chain.p[0], mid[1] - chain.p[1]) < Math.hypot(mid[mid.length - 2] - chain.p[0], mid[mid.length - 1] - chain.p[1]);
    startsAtA ? forward++ : backward++;
  }
  if (backward > forward) chain.p = reverseFlat(chain.p);

  const anchors = placeStationsAlong(chain, plan.zones.length, 0.1);
  plan.zones.forEach((zone, i) => {
    const anchor = anchors[i];
    const snap = snapToGraph(graph, anchor.x, anchor.z, chain.edgeIds);
    const edge = graph.edges[snap.edge];
    const nearIsA = snap.s <= edge.len / 2;
    const nodeIndex = nearIsA ? edge.a : edge.b;
    const farIndex = nearIsA ? edge.b : edge.a;
    const roadWidth = world.roads.find((r) => r.id === edge.way)?.width ?? 8;
    const st = {
      zone, label: labelOf(zone), district: district.id,
      x: anchor.x, z: anchor.z, heading: anchor.heading,
      node: graph.nodes[nodeIndex].id, nodeIndex, toNode: graph.nodes[farIndex].id, nodeIndexFar: farIndex,
      edge: snap.edge, road: edge.name ?? district.street, roadClass: edge.cls, roadWidth,
      address: streetAddress(district.street, i), streetOffset: Math.round(anchor.s * 10) / 10,
      snapDistance: Math.round(snap.distance * 10) / 10, anchor: projection.toLatLng(anchor.x, anchor.z),
    };
    stations.push(st);
    if (zone === 'home') spawn = { x: st.x, z: st.z, yaw: st.heading, nodeIndex, node: st.node, road: st.road };
  });
  const d = {
    id: district.id, street: district.street, length: Math.round(chain.length),
    p: chain.p.map((v) => Math.round(v * 10) / 10), stations: plan.zones,
  };
  outDistricts.push(d);
  if (district.id === 'products') mainStreet = { name: district.street, length: d.length, p: d.p, stations: plan.zones, addresses: stations.filter((s) => plan.zones.includes(s.zone)).map((s) => s.address) };
  console.log(`${district.street.padEnd(20)} ${chain.length.toFixed(0)} m  ${plan.zones.length} stops`);
}
const off = stations.filter((s) => s.snapDistance > 8);
if (off.length) { console.error('Off-street:', off.map((s) => s.label)); process.exit(1); }

world.stations = stations;
world.spawn = spawn;
world.mainStreet = mainStreet;
world.districts = outDistricts;
world.meta.mainStreet = { name: mainStreet.name, length: mainStreet.length, stops: mainStreet.stations.length };
fs.writeFileSync(worldFile, JSON.stringify(world));
for (const s of stations) console.log(`  ${s.label.padEnd(20)} ${s.address.padEnd(28)} ${s.x.toFixed(0)},${s.z.toFixed(0)}`);
