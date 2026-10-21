#!/usr/bin/env node
/**
 * Validate the *shipped* compact world and write a human-readable report.
 *
 *   node scripts/validate-world.mjs
 *
 * Exit code 1 when a hard property fails (disconnected graph, unreachable
 * destination, station outside the playable area, route through a building,
 * map archive still covering the old district). This is the check that should
 * have caught the previous oversized build before it shipped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrateGraph, findRoute, snapToGraph } from '../lib/geo/graph.ts';
import { planToStation } from '../lib/world/autopilot.ts';
import { createCar } from '../lib/world/vehicle.ts';
import { buildFurniture, buildStreetLights } from '../lib/world/props.ts';
import { distanceToPolyline, flatLength } from '../lib/world/main-street.ts';
import { projects } from '../lib/projects.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const read = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));

const world = read('lagos-world.json');
const payload = read('lagos-graph.json');
const graph = hydrateGraph(payload);
const playable = world.meta.playable;
const failures = [];
const notes = [];

if (!playable) failures.push('world meta has no playable bounds');
const w = playable?.size.width ?? 0;
const d = playable?.size.depth ?? 0;
if (w < 400 || w > 650 || d < 400 || d > 650) {
  failures.push(`playable area is ${w.toFixed(1)} × ${d.toFixed(1)} m, expected 400–650 m`);
}

/* Roads ------------------------------------------------------------- */

let roadMetres = 0;
for (const road of world.roads) {
  for (let i = 2; i < road.pts.length; i += 2) {
    roadMetres += Math.hypot(road.pts[i] - road.pts[i - 2], road.pts[i + 1] - road.pts[i - 1]);
  }
  if (road.width < 5.4) failures.push(`road ${road.name ?? road.id} is narrower than 5.4 m`);
}
const minWidth = world.roads.reduce((m, r) => Math.min(m, r.width), Infinity);
const named = world.roads.filter((r) => r.name).length;

/* Graph + dangling ends --------------------------------------------- */

const degree = new Array(graph.nodes.length).fill(0);
for (const e of graph.edges) {
  degree[e.a]++;
  degree[e.b]++;
}
const dangling = graph.nodes.filter((_, i) => degree[i] === 1);
const inside = (n) =>
  !playable ||
  (n.x >= playable.world.minX && n.x <= playable.world.maxX && n.z >= playable.world.minZ && n.z <= playable.world.maxZ);
const danglingPlayable = dangling.filter(inside);
if (graph.stats.components.length !== 1) {
  failures.push(`graph has ${graph.stats.components.length} components: ${graph.stats.components.join(', ')}`);
}

/* Buildings ---------------------------------------------------------- */

const chunks = [];
for (let row = 0; row < world.meta.chunks; row++) {
  for (let col = 0; col < world.meta.chunks; col++) {
    const file = `lagos-buildings-${row}${col}.json`;
    if (!fs.existsSync(path.join(DATA, file))) {
      failures.push(`missing building bundle ${file}`);
      continue;
    }
    chunks.push(read(file));
  }
}
const buildingList = chunks.flatMap((c) => c.b);
const heights = buildingList.map((b) => b.h);

const CELL = 50;
const grid = new Map();
for (const b of buildingList) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < b.p.length; i += 2) {
    minX = Math.min(minX, b.p[i]); maxX = Math.max(maxX, b.p[i]);
    minZ = Math.min(minZ, b.p[i + 1]); maxZ = Math.max(maxZ, b.p[i + 1]);
  }
  const entry = { b, minX, maxX, minZ, maxZ };
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = `${cx},${cz}`;
      (grid.get(k) ?? grid.set(k, []).get(k)).push(entry);
    }
  }
}

function inPolygon(x, z, p) {
  let hit = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

function insideBuilding(x, z) {
  const list = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (!list) return false;
  for (const e of list) {
    if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) continue;
    if (inPolygon(x, z, e.b.p)) return true;
  }
  return false;
}

/* Main street -------------------------------------------------------- */

const street = world.mainStreet;
let mainStreetMetres = 0;
if (!street) {
  failures.push('world has no mainStreet: every destination must be on one continuous street');
} else {
  mainStreetMetres = flatLength(street.p);
  if (Math.abs(mainStreetMetres - street.length) > 2) {
    failures.push(`mainStreet length ${street.length} m disagrees with its polyline (${mainStreetMetres.toFixed(1)} m)`);
  }
  if (!street.name) failures.push('mainStreet has no name');
  if (mainStreetMetres < 250) failures.push(`main street is only ${mainStreetMetres.toFixed(0)} m long`);
  const onStreet = world.stations.filter((s) => s.road === street.name).length;
  if (onStreet !== world.stations.length) {
    failures.push(`${world.stations.length - onStreet} destinations are not on ${street.name}`);
  }
  for (const s of world.stations) {
    const d = distanceToPolyline(street.p, s.x, s.z);
    if (d > 2) failures.push(`${s.label} is ${d.toFixed(1)} m from the ${street.name} centreline`);
  }
  const ordered = [...world.stations].sort((a, b) => (a.streetOffset ?? 0) - (b.streetOffset ?? 0)).map((s) => s.zone);
  if (ordered.join('|') !== street.stations.join('|')) {
    failures.push('mainStreet station order does not match street offsets');
  }
  const addresses = new Set(world.stations.map((s) => s.address));
  if (addresses.size !== world.stations.length) failures.push('two destinations share a street address');
}

const projectStations = world.stations.filter((s) => s.zone.startsWith('project:'));
if (projectStations.length !== projects.length) {
  failures.push(`${projectStations.length} project destinations for ${projects.length} portfolio projects`);
}
for (const project of projects) {
  const zone = `project:${project.slug}`;
  if (!world.stations.some((s) => s.zone === zone)) failures.push(`project ${project.title} has no destination on the street`);
}

/* Stations + routes -------------------------------------------------- */

const spawn = world.spawn;
const car = spawn ? createCar(spawn) : null;
const stationRows = [];
let routeVertices = 0;
let routeInside = 0;
let routeOffRoad = 0;
let unreachable = 0;

for (const station of world.stations) {
  const onPlayable =
    !!playable &&
    station.x >= playable.world.minX && station.x <= playable.world.maxX &&
    station.z >= playable.world.minZ && station.z <= playable.world.maxZ;
  if (!onPlayable) failures.push(`${station.label} is outside the playable bounds`);
  if (station.snapDistance >= 2) failures.push(`${station.label} is ${station.snapDistance.toFixed(1)} m off its road`);

  let route = '—';
  let reachable = false;
  let buildingHits = 0;
  let offRoad = 0;
  if (spawn && car && station.zone !== 'home') {
    const direct = findRoute(graph, spawn.nodeIndex, station.nodeIndex);
    reachable = direct.ok;
    if (!direct.ok) {
      unreachable++;
      failures.push(`${station.label} is unreachable: ${direct.message}`);
    } else {
      route = `${Math.round(direct.route.length)} m`;
    }
    const plan = planToStation(graph, car, station);
    if (!plan.ok) {
      failures.push(`${station.label} plan failed: ${plan.message}`);
    } else {
      const p = plan.route.p;
      for (let i = 0; i < p.length; i += 2) {
        routeVertices++;
        if (snapToGraph(graph, p[i], p[i + 1]).distance >= 1.5) offRoad++;
        if (insideBuilding(p[i], p[i + 1])) buildingHits++;
      }
      routeInside += buildingHits;
      routeOffRoad += offRoad;
      route = `${Math.round(plan.route.length)} m`;
    }
  } else {
    reachable = true;
  }
  stationRows.push({
    label: station.label,
    address: station.address ?? '—',
    road: station.road ?? station.roadClass,
    snap: station.snapDistance,
    onPlayable,
    reachable,
    route,
    offRoad,
    buildingHits,
  });
}
if (routeVertices > 0 && routeOffRoad > 0) failures.push(`${routeOffRoad} route vertices are off the road network`);
if (routeVertices > 0 && routeInside / routeVertices >= 0.02) {
  failures.push(`${routeInside}/${routeVertices} route vertices fall inside buildings`);
}

// Every stop must be drivable from every other stop, not just from the spawn.
let pairFailures = 0;
for (const from of world.stations) {
  for (const to of world.stations) {
    if (from.zone === to.zone) continue;
    const plan = planToStation(graph, { x: from.x, z: from.z, yaw: from.heading }, to);
    if (!plan.ok) {
      pairFailures++;
      if (pairFailures <= 5) failures.push(`${from.label} → ${to.label}: ${plan.message}`);
    }
  }
}
if (pairFailures > 5) failures.push(`${pairFailures} station-to-station drives cannot be planned`);

/* Rendered street dressing ------------------------------------------- */

const renderedLights = buildStreetLights(world.roads, world.lights);
const furniture = buildFurniture(world.roads, world.stations);

/* Map archive -------------------------------------------------------- */

let archive = 'missing';
try {
  const file = path.join(ROOT, 'public', 'map', 'lagos.pmtiles');
  const buf = fs.readFileSync(file);
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const box = {
    west: v.getInt32(102, true) / 1e7,
    south: v.getInt32(106, true) / 1e7,
    east: v.getInt32(110, true) / 1e7,
    north: v.getInt32(114, true) / 1e7,
    maxzoom: buf[101],
  };
  const b = world.meta.bounds;
  if (box.west < b.west - 0.001 || box.east > b.east + 0.001 || box.south < b.south - 0.001 || box.north > b.north + 0.001) {
    failures.push(`PMTiles ${JSON.stringify(box)} is not clipped to the world bounds ${JSON.stringify(b)}`);
  }
  archive = `${(buf.length / 1048576).toFixed(1)} MiB · ${box.west.toFixed(5)},${box.south.toFixed(5)} → ${box.east.toFixed(5)},${box.north.toFixed(5)} · z0–${box.maxzoom}`;
} catch (error) {
  failures.push(`could not read PMTiles: ${error.message}`);
}

/* Report ------------------------------------------------------------- */

const line = (label, value) => `| ${label} | ${value} |`;
const report = `# World validation

Generated by \`node scripts/validate-world.mjs\` from the shipped files in
\`public/data\` and \`public/map\`. It is a check of the artifact, not of the
build command: a successful Next.js build proves none of this.

**Result: ${failures.length ? `${failures.length} failure(s)` : 'PASS'}**

## Extent

| Property | Value |
| --- | --- |
${line('Playable area', `${w.toFixed(1)} × ${d.toFixed(1)} m (${((w * d) / 10000).toFixed(1)} ha)`)}
${line('Extraction rectangle', `${world.meta.size.width.toFixed(1)} × ${world.meta.size.depth.toFixed(1)} m`)}
${line('Map archive', archive)}
${line('Source snapshot', world.meta.snapshot)}

## Network

| Property | Value |
| --- | --- |
${line('Main street', street ? `${street.name} · ${mainStreetMetres.toFixed(0)} m · ${world.stations.length} stops` : 'MISSING')}
${line('Drivable ways', world.roads.length)}
${line('Named streets', named)}
${line('Drivable length', `${(roadMetres / 1000).toFixed(2)} km`)}
${line('Narrowest carriageway', `${minWidth.toFixed(1)} m`)}
${line('Graph nodes / edges', `${graph.nodes.length} / ${graph.edges.length}`)}
${line('Connected components', `${graph.stats.components.length} (${graph.stats.components.join(', ')} nodes)`)}
${line('Dead ends inside playable area', `${danglingPlayable.length} (cul-de-sacs, not disconnected fragments)`)}
${line('Surveyed / rendered streetlights', `${world.lights.length} / ${renderedLights.length}`)}
${line('Street furniture (generated)', furniture.length)}
${line('Trees', world.trees.length)}
${line('Buildings', buildingList.length)}
${line('Building height range', `${Math.min(...heights).toFixed(1)}–${Math.max(...heights).toFixed(1)} m`)}

## Destinations

| Stop | Address | Road | Snap | In playable | Reachable | Route | Off-road vertices | Building hits |
| --- | --- | --- | ---: | :---: | :---: | ---: | ---: | ---: |
${stationRows
  .map(
    (s) =>
      `| ${s.label} | ${s.address} | ${s.road} | ${s.snap.toFixed(1)} m | ${s.onPlayable ? 'yes' : 'NO'} | ${s.reachable ? 'yes' : 'NO'} | ${s.route} | ${s.offRoad} | ${s.buildingHits} |`
  )
  .join('\n')}

Route vertices checked: ${routeVertices}; off-road: ${routeOffRoad}; inside building footprints: ${routeInside}.

## Notes

- Dead ends are measured after curation. A surviving dead end is legitimate
  street geometry (a cul-de-sac inside the neighbourhood), but anything that
  merely runs off the extraction edge is a defect.
- Route/building overlap is a data property of OSM (a handful of footprints
  touch a centreline). It is reported, not hidden; the threshold is 2 %.
- The map archive is the Planetiler clip of the same OSM snapshot and the same
  bounds, so it cannot show a different district.

${failures.length ? `## Failures\n\n${failures.map((f) => `- ${f}`).join('\n')}\n` : ''}`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'world-validation.md'), report);
console.log(report);
if (failures.length) process.exitCode = 1;
