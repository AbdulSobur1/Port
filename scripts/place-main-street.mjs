#!/usr/bin/env node
/**
 * Place every portfolio stop on the one main street, without re-parsing the PBF.
 *
 * The extractor calls the same `lib/world/main-street.ts` functions, so this is
 * a fast, deterministic re-placement for an already-extracted snapshot:
 *
 *   node scripts/place-main-street.mjs
 *
 * It rewrites only `stations`, `spawn` and `mainStreet` in
 * public/data/lagos-world.json. Roads, buildings and the graph are untouched —
 * the stops are moved onto the existing street, not the street rebuilt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_STREET, STATIONS } from './geo-config.mjs';
import { createProjection } from '../lib/geo/projection.ts';
import { hydrateGraph, snapToGraph } from '../lib/geo/graph.ts';
import { longestStreetChain, placeStationsAlong, streetAddress } from '../lib/world/main-street.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const worldFile = path.join(DATA, 'lagos-world.json');

const world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
const payload = JSON.parse(fs.readFileSync(path.join(DATA, 'lagos-graph.json'), 'utf8'));
const graph = hydrateGraph(payload);
const playable = world.meta.playable.world;
const projection = createProjection(world.meta.bounds);

const street = longestStreetChain(payload.edges, MAIN_STREET.name, playable);
if (!street) {
  console.error(`No continuous ${MAIN_STREET.name} inside the playable area.`);
  process.exit(1);
}
const anchors = placeStationsAlong(street, STATIONS.length, MAIN_STREET.margin);

const stations = [];
let spawn = null;
for (let index = 0; index < STATIONS.length; index++) {
  const st = STATIONS[index];
  const anchor = anchors[index];
  const snap = snapToGraph(graph, anchor.x, anchor.z, street.edgeIds);
  const edge = graph.edges[snap.edge];
  const nearIsA = snap.s <= edge.len / 2;
  const nodeIndex = nearIsA ? edge.a : edge.b;
  const farIndex = nearIsA ? edge.b : edge.a;
  const roadWidth = world.roads.find((r) => r.id === edge.way)?.width ?? 12;
  const station = {
    zone: st.zone,
    label: st.label,
    x: anchor.x,
    z: anchor.z,
    heading: anchor.heading,
    node: graph.nodes[nodeIndex].id,
    nodeIndex,
    toNode: graph.nodes[farIndex].id,
    nodeIndexFar: farIndex,
    edge: snap.edge,
    road: edge.name ?? MAIN_STREET.name,
    roadClass: edge.cls,
    roadWidth,
    address: streetAddress(MAIN_STREET.name, index),
    streetOffset: Math.round(anchor.s * 10) / 10,
    snapDistance: Math.round(snap.distance * 10) / 10,
    anchor: projection.toLatLng(anchor.x, anchor.z),
  };
  stations.push(station);
  if (st.zone === 'home') {
    spawn = {
      x: station.x,
      z: station.z,
      yaw: station.heading,
      nodeIndex,
      node: station.node,
      road: station.road,
    };
  }
}

const offStreet = stations.filter((s) => s.snapDistance > 8);
if (offStreet.length) {
  console.error('Stations landed off the main street:', offStreet.map((s) => s.label));
  process.exit(1);
}

world.stations = stations;
world.spawn = spawn;
world.mainStreet = {
  name: MAIN_STREET.name,
  length: Math.round(street.length * 10) / 10,
  p: street.p.map((v) => Math.round(v * 10) / 10),
  stations: stations.map((s) => s.zone),
  addresses: stations.map((s) => s.address),
};
world.meta.mainStreet = {
  name: world.mainStreet.name,
  length: world.mainStreet.length,
  stops: stations.length,
};

fs.writeFileSync(worldFile, JSON.stringify(world));

const spacing = street.length * (1 - MAIN_STREET.margin * 2) / Math.max(1, stations.length - 1);
console.log(`main street: ${MAIN_STREET.name}`);
console.log(`  ${street.length.toFixed(1)} m inside the playable core, ${stations.length} stops, ~${spacing.toFixed(0)} m apart`);
for (const s of stations) {
  console.log(`  ${s.label.padEnd(13)} ${s.address.padEnd(26)} ${s.x.toFixed(0)},${s.z.toFixed(0)}  s=${s.streetOffset.toFixed(0)} m  ${s.road}`);
}
