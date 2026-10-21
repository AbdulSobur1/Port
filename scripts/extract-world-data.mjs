/**
 * Extract the drivable Lagos world from the Geofabrik Nigeria PBF.
 *
 *   node scripts/extract-world-data.mjs
 *
 * Input : data/raw/nigeria-261015.osm.pbf (checksum-verified by download-osm.mjs)
 * Output: public/data/lagos-world.json        road/water/green/POI/tree/station data
 *         public/data/lagos-graph.json        routed road graph (junction-to-junction edges)
 *         public/data/lagos-buildings-*.json  3×3 spatial chunks of real building footprints
 *         public/data/lagos-provenance.json   source snapshot, bounds, CRS, counts, quality report
 *
 * The national PBF is a processing input only; it never ships. Everything in
 * public/data is derived from the verified snapshot and is reproducible with
 * the pinned tool versions recorded in the provenance file.
 *
 * Geometry is projected through lib/geo/projection.ts — the exact module the
 * browser uses — so the 3D world, the map overlay, collision bodies and the
 * route graph share one transformation and cannot drift.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import parseOSM from 'osm-pbf-parser';
import { ROOT, BOUNDS, PLAYABLE, CURATION, OSM_SOURCE, STATIONS, MAIN_STREET, OUTPUT } from './geo-config.mjs';
import { createCollector, ROAD_CLASSES } from './lib/osm-pbf-passes.mjs';
import { curateRoadNetwork } from './lib/curate-roads.mjs';
import { rdpFlat, ringArea, quantizeFlat } from './lib/geometry-utils.mjs';
import { chainCoastlines, seaPolygon } from './lib/coastline.mjs';
import { createProjection } from '../lib/geo/projection.ts';
import { buildRouteGraph, snapToGraph, mainComponentNode, findRoute } from '../lib/geo/graph.ts';
import { longestStreetChain, placeStationsAlong, streetAddress } from '../lib/world/main-street.ts';

const PBF = path.join(ROOT, OSM_SOURCE.file);
const OUT_DIR = path.join(ROOT, 'public', 'data');
const CHUNKS = 3; // 3×3 building bundles, loaded on demand around the camera

const proj = createProjection(BOUNDS);
const { worldBounds, size } = proj;

const t0 = Date.now();
const log = (...args) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);

if (!fs.existsSync(PBF)) {
  console.error(`Missing ${OSM_SOURCE.file}. Run: node scripts/download-osm.mjs`);
  process.exit(1);
}
const pbfBytes = fs.statSync(PBF).size;
if (pbfBytes !== OSM_SOURCE.expectedBytes) {
  console.error(`PBF size mismatch (${pbfBytes} != ${OSM_SOURCE.expectedBytes}). Re-run download-osm.mjs`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 1. Stream the PBF                                                   */
/* ------------------------------------------------------------------ */

const collector = createCollector(BOUNDS);
let entities = 0;

log(`streaming ${(pbfBytes / 1048576).toFixed(0)} MiB PBF …`);
const reader = fs.createReadStream(PBF, { highWaterMark: 1 << 22 });
// osm-pbf-parser is a classic (non-iterable) stream: consume it with events.
// Processing is synchronous, which keeps memory bounded without pause/resume.
const parser = reader.pipe(parseOSM());

let lastReport = Date.now();
await new Promise((resolve, reject) => {
  parser.on('data', (items) => {
    for (const item of items) {
      entities++;
      if (item.type === 'node') collector.pushNode(item);
      else if (item.type === 'way') collector.pushWay(item);
      else if (item.type === 'relation') collector.pushRelation(item);
    }
    if (Date.now() - lastReport > 15000) {
      lastReport = Date.now();
      log(`  ${(entities / 1e6).toFixed(1)}M entities, ${(collector.nodeLng.length / 1e6).toFixed(2)}M in-bounds nodes, ${collector.buildings.length} buildings`);
    }
  });
  parser.on('end', resolve);
  parser.on('error', reject);
  reader.on('error', reject);
});
log(`parsed ${(entities / 1e6).toFixed(1)}M entities`);
log('collector stats', collector.stats);

/* ------------------------------------------------------------------ */
/* 2. Project to world metres + simplify                              */
/* ------------------------------------------------------------------ */

const worldPoint = (lng, lat) => {
  const w = proj.toWorld(lng, lat);
  return [Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10];
};

function projectFlat(lngLat) {
  const out = new Array(lngLat.length);
  for (let i = 0; i < lngLat.length; i += 2) {
    const w = proj.toWorld(lngLat[i], lngLat[i + 1]);
    out[i] = w.x;
    out[i + 1] = w.z;
  }
  return out;
}

function polygonWorld(lngLat, epsilon) {
  let p = projectFlat(lngLat);
  const closed = Math.abs(p[0] - p[p.length - 2]) < 0.05 && Math.abs(p[1] - p[p.length - 1]) < 0.05;
  if (closed) p = p.slice(0, -2);
  if (p.length < 6) return null;
  if (epsilon) p = rdpFlat(p, epsilon);
  if (p.length < 6) return null;
  if (Math.abs(ringArea(p)) < 12) return null; // < 12 m²: noise
  if (ringArea(p) < 0) p = reverseRing(p); // consistent winding (CCW)
  return quantizeFlat(p);
}

function reverseRing(p) {
  const out = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

/** Distance from a point to a polyline (metres). */
function distanceToPolyline(p, x, z) {
  let best = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
    const d = Math.hypot(x0 + t * dx - x, z0 + t * dz - z);
    if (d < best) best = d;
  }
  return best;
}

/* Roads ------------------------------------------------------------- */

const roads = [];
const roadStatsByClass = {};
let roadPoints = 0;

for (const r of collector.roads) {
  if (r.p.length < 4) continue;
  const pts = projectFlat(r.p); // keep point/ref parallelism for the graph
  if (pts.length !== r.refs.length * 2) continue;
  const speedKmh = r.maxspeed ?? null;
  const speed = speedKmh ? speedKmh / 3.6 : ROAD_CLASSES[r.cls].speed;
  const entry = {
    id: r.osmId,
    cls: r.cls,
    name: r.name,
    width: r.width,
    oneway: r.oneway,
    drivable: r.driv,
    speed: Math.round(speed * 100) / 100,
    bridge: r.bridge,
    tunnel: r.tunnel,
    refs: r.refs,
    pts: quantizeFlat(pts),
  };
  if (!r.driv) entry.pts = quantizeFlat(rdpFlat(pts, 0.6));
  roads.push(entry);
  roadPoints += entry.pts.length / 2;
  roadStatsByClass[r.cls] = (roadStatsByClass[r.cls] ?? 0) + 1;
}

log(`roads before curation: ${roads.length} ways, ${roadPoints.toLocaleString()} points`);

/* ------------------------------------------------------------------ */
/* 2b. Curation: extract → drivable network                            */
/* ------------------------------------------------------------------ */

// The extract contains every mapped way: parking aisles, driveways, footways
// and fragments that dead-end a few metres off a street. Curation removes them
// here, before the graph is built, so the road surface, the intersections, the
// collision data and the navigation graph are all the same curated set.
// The main street itself is protected from curation: every station is placed
// on it, so pruning one of its segments would orphan destinations. Anchor
// points are no longer authored by hand — they are generated from this street.
const protectedPoints = roads
  .filter((r) => r.name === MAIN_STREET.name)
  .flatMap((r) => {
    const out = [];
    for (let i = 0; i < r.pts.length; i += 2) out.push({ x: r.pts[i], z: r.pts[i + 1] });
    return out;
  });

/** Playable rectangle in world metres, derived from the same projection. */
const playableCorners = [
  proj.toWorld(PLAYABLE.west, PLAYABLE.south),
  proj.toWorld(PLAYABLE.east, PLAYABLE.north),
];
const playableWorld = {
  minX: Math.min(playableCorners[0].x, playableCorners[1].x),
  maxX: Math.max(playableCorners[0].x, playableCorners[1].x),
  minZ: Math.min(playableCorners[0].z, playableCorners[1].z),
  maxZ: Math.max(playableCorners[0].z, playableCorners[1].z),
};

log('curating the road network:');
const curation = curateRoadNetwork(roads, {
  ...CURATION,
  protectedPoints,
  buildGraph: (list) => buildRouteGraph(list, collector.restrictions),
  log,
});
roads.length = 0;
roads.push(...curation.roads);

// Class histogram and point count now describe the shipped network, not the raw extract.
for (const key of Object.keys(roadStatsByClass)) delete roadStatsByClass[key];
roadPoints = 0;
for (const r of roads) {
  roadStatsByClass[r.cls] = (roadStatsByClass[r.cls] ?? 0) + 1;
  roadPoints += r.pts.length / 2;
}
log(
  `curated network: ${curation.stats.outputWays} ways / ${(curation.stats.outputMetres / 1000).toFixed(2)} km ` +
  `(was ${curation.stats.inputWays} ways / ${(curation.stats.inputMetres / 1000).toFixed(2)} km), ` +
  `${curation.stats.graphNodes} nodes, ${curation.stats.graphEdges} edges, ${curation.stats.loops} loops, ` +
  `${curation.stats.danglingEndsAfter} dangling ends, ${curation.stats.componentsAfter} components`
);

/* Water, green, sea ------------------------------------------------ */

const water = collector.waterPolys.map((w) => polygonWorld(w.p, 0.8)).filter(Boolean);
const green = collector.greenPolys.map((g) => polygonWorld(g.p, 1.0)).filter(Boolean);
const waterwayLines = collector.waterLines
  .map((l) => ({ w: l.w, p: quantizeFlat(rdpFlat(projectFlat(l.p), 0.8)) }))
  .filter((l) => l.p.length >= 4);

const coast = chainCoastlines(collector.coastWays, BOUNDS);
const seaRing = seaPolygon(coast.rings.map((r) => projectFlat(r)));
const sea = seaRing ? [quantizeFlat(seaRing)] : [];
log(`water polys ${water.length}, green polys ${green.length}, sea rings ${sea.length} (coast chains closed: ${coast.closed}, boundary: ${coast.boundaryClosed ?? coast.boundaryClosures})`);

/* Buildings -------------------------------------------------------- */

const buildings = [];
let heightFromTags = 0;
let heightFromLevels = 0;
let heightEstimated = 0;
let buildingPoints = 0;

for (const b of collector.buildings) {
  const ring = polygonWorld(b.p, 0.35);
  if (!ring) continue;
  buildings.push({ h: b.h, p: ring });
  buildingPoints += ring.length / 2;
  if (b.hsrc === 'tag') heightFromTags++;
  else if (b.hsrc === 'levels') heightFromLevels++;
  else heightEstimated++;
}
log(`buildings: ${buildings.length} (${buildingPoints.toLocaleString()} vertices)`);

/* Spatial index for building occupancy (used to keep trees out of walls) */

const GRID_CELL = 40;
const occupancy = new Map(); // "cx,cz" -> [{minX,maxX,minZ,maxZ}]
for (const b of buildings) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < b.p.length; i += 2) {
    if (b.p[i] < minX) minX = b.p[i];
    if (b.p[i] > maxX) maxX = b.p[i];
    if (b.p[i + 1] < minZ) minZ = b.p[i + 1];
    if (b.p[i + 1] > maxZ) maxZ = b.p[i + 1];
  }
  const box = { minX, maxX, minZ, maxZ };
  for (let cx = Math.floor(minX / GRID_CELL); cx <= Math.floor(maxX / GRID_CELL); cx++) {
    for (let cz = Math.floor(minZ / GRID_CELL); cz <= Math.floor(maxZ / GRID_CELL); cz++) {
      const key = `${cx},${cz}`;
      const list = occupancy.get(key);
      if (list) list.push(box); else occupancy.set(key, [box]);
    }
  }
}

function insideBuilding(x, z, margin = 1) {
  const cx = Math.floor(x / GRID_CELL), cz = Math.floor(z / GRID_CELL);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const list = occupancy.get(`${cx + ox},${cz + oz}`);
      if (!list) continue;
      for (const b of list) {
        if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
      }
    }
  }
  return false;
}

/* Deterministic vegetation + street furniture ---------------------- */

function hash(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const TREEABLE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const trees = [];
const lights = [];

// Keep real OSM trees first, then fill in street trees deterministically.
for (let i = 0; i < collector.trees.length; i += 2) {
  const [x, z] = worldPoint(collector.trees[i], collector.trees[i + 1]);
  trees.push([x, z, 0]);
}

let treeSeed = 0;
for (const road of roads) {
  if (!TREEABLE.has(road.cls) || road.bridge || road.tunnel) continue;
  if (road.pts.length < 6) continue;
  const half = road.width / 2;
  let carry = hash(road.id) * 18;
  for (let i = 2; i < road.pts.length; i += 2) {
    const x0 = road.pts[i - 2], z0 = road.pts[i - 1], x1 = road.pts[i], z1 = road.pts[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 0.01) continue;
    const nx = -(z1 - z0) / seg, nz = (x1 - x0) / seg;
    for (let s = carry; s < seg; s += 17 + hash(treeSeed++) * 9) {
      const t = s / seg;
      const x = x0 + t * (x1 - x0), z = z0 + t * (z1 - z0);
      for (const side of [-1, 1]) {
        const r = 0.55 + hash(treeSeed++) * 0.6;
        if (hash(treeSeed++) < 0.42) continue; // gaps in planting
        const px = x + nx * side * (half + 3.4 + r), pz = z + nz * side * (half + 3.4 + r);
        if (px < worldBounds.minX + 6 || px > worldBounds.maxX - 6) continue;
        if (pz < worldBounds.minZ + 6 || pz > worldBounds.maxZ - 6) continue;
        if (insideBuilding(px, pz, 1.2)) continue;
        trees.push([Math.round(px * 10) / 10, Math.round(pz * 10) / 10, Math.round((0.75 + hash(treeSeed++) * 0.6) * 100) / 100]);
        if (trees.length > 12000) break;
      }
    }
    carry = 0;
  }
  if (trees.length > 12000) break;
}

for (const road of roads) {
  if (!['primary', 'secondary', 'tertiary'].includes(road.cls) || road.bridge || road.tunnel) continue;
  const half = road.width / 2;
  let acc = 0;
  let side = hash(road.id) > 0.5 ? 1 : -1;
  for (let i = 2; i < road.pts.length; i += 2) {
    const x0 = road.pts[i - 2], z0 = road.pts[i - 1], x1 = road.pts[i], z1 = road.pts[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 0.01) continue;
    const nx = -(z1 - z0) / seg, nz = (x1 - x0) / seg;
    for (let s = acc; s < seg; s += 34) {
      const t = s / seg;
      side = -side;
      const px = x0 + t * (x1 - x0) + nx * side * (half + 1.1);
      const pz = z0 + t * (z1 - z0) + nz * side * (half + 1.1);
      if (insideBuilding(px, pz, 0.6)) continue;
      lights.push([Math.round(px * 10) / 10, Math.round(pz * 10) / 10, side]);
      if (lights.length > 4000) break;
    }
    acc = 0;
  }
  if (lights.length > 4000) break;
}

/* POIs ------------------------------------------------------------- */

const pois = [];
const seenPoi = new Set();
for (const poi of collector.pois) {
  const [x, z] = worldPoint(poi.lng, poi.lat);
  const key = `${poi.k}|${poi.n}`;
  if (seenPoi.has(key)) continue;
  seenPoi.add(key);
  pois.push({ k: poi.k, n: poi.n, x, z });
}
log(`pois ${pois.length}, trees ${trees.length}, streetlights ${lights.length}`);

/* ------------------------------------------------------------------ */
/* 3. Route graph                                                      */
/* ------------------------------------------------------------------ */

const graph = buildRouteGraph(roads, collector.restrictions);
log(
  `graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
  `${graph.stats.junctionCount} junctions, largest components ${graph.stats.components.slice(0, 4).join('/')}, ` +
  `banned turns ${graph.banned.length} ${JSON.stringify(graph.stats.turnRestrictions)}`
);

/* Pedestrian crossings: OSM maps these as nodes, so they are projected onto
 * the nearest road to get a real position and a real road orientation. */
const widthByWay = new Map();
for (const r of roads) widthByWay.set(r.id, r.width);
const crossings = [];
for (let i = 0; i < collector.crossings.length; i += 2) {
  const { x, z } = proj.toWorld(collector.crossings[i], collector.crossings[i + 1]);
  const snap = snapToGraph(graph, x, z);
  if (snap.distance > 18) continue;
  const edge = graph.edges[snap.edge];
  crossings.push({
    x: Math.round(snap.x * 10) / 10,
    z: Math.round(snap.z * 10) / 10,
    h: Math.round(snap.heading * 1000) / 1000,
    w: widthByWay.get(edge.way) ?? 6,
  });
  if (crossings.length >= 600) break;
}
log(`crossings mapped onto roads: ${crossings.length} of ${collector.stats.crossings} OSM crossings`);

/* Stations ---------------------------------------------------------- */

const street = longestStreetChain(graph.edges, MAIN_STREET.name, playableWorld);
if (!street) {
  console.error(`The main street "${MAIN_STREET.name}" has no continuous drivable run inside the playable area.`);
  process.exit(1);
}
const anchors = placeStationsAlong(street, STATIONS.length, MAIN_STREET.margin);
log(
  `main street: ${MAIN_STREET.name}, ${street.length.toFixed(1)} m through the playable core, ` +
  `${STATIONS.length} stops every ~${(street.length * (1 - MAIN_STREET.margin * 2) / Math.max(1, STATIONS.length - 1)).toFixed(0)} m`
);

const stations = [];
const stationReport = [];
let spawn = null;

for (let index = 0; index < STATIONS.length; index++) {
  const st = STATIONS[index];
  const anchor = anchors[index];
  // Snap inside the main-street chain only, so a stop can never silently land
  // on the parallel carriageway or a cross street.
  const snap = snapToGraph(graph, anchor.x, anchor.z, street.edgeIds);
  const edge = graph.edges[snap.edge];
  const nodeIndex = snap.s <= edge.len / 2 ? edge.a : edge.b;
  const toNode = snap.s <= edge.len / 2 ? edge.b : edge.a;
  const roadWidth = roads.find((r) => r.id === edge.way)?.width ?? 12;
  const station = {
    zone: st.zone,
    label: st.label,
    x: anchor.x,
    z: anchor.z,
    heading: anchor.heading,
    node: graph.nodes[nodeIndex].id,
    nodeIndex,
    toNode: graph.nodes[toNode].id,
    nodeIndexFar: toNode,
    edge: snap.edge,
    road: edge.name ?? MAIN_STREET.name,
    roadClass: edge.cls,
    roadWidth,
    address: streetAddress(MAIN_STREET.name, index),
    /** Distance along the main street, metres. Sequence is the walking order. */
    streetOffset: Math.round(anchor.s * 10) / 10,
    snapDistance: Math.round(snap.distance * 10) / 10,
    anchor: proj.toLatLng(anchor.x, anchor.z),
  };
  stations.push(station);
  stationReport.push(`${st.label.padEnd(13)} ${station.address.padEnd(26)} s=${station.streetOffset.toFixed(0).padStart(4)} m  off-road ${station.snapDistance.toFixed(1)} m`);
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

log('main-street stations:\n  ' + stationReport.join('\n  '));

const offStreet = stations.filter((s) => s.snapDistance > 8);
if (offStreet.length) {
  console.error('Stations placed more than 8 m from the main street centreline:', offStreet.map((s) => s.label));
  process.exit(1);
}

const mainStreet = {
  name: MAIN_STREET.name,
  length: Math.round(street.length * 10) / 10,
  p: street.p.map((v) => Math.round(v * 10) / 10),
  stations: stations.map((s) => s.zone),
  addresses: stations.map((s) => s.address),
};

/* Routing sanity: every station must be reachable from the spawn node. */
const startIndex = spawn.nodeIndex;
const routeChecks = [];
for (const s of stations) {
  if (s.zone === 'home') continue;
  const res = findRoute(graph, startIndex, s.nodeIndex);
  if (res.ok) {
    routeChecks.push({ zone: s.zone, ok: true, length: Math.round(res.route.length), seconds: Math.round(res.route.duration) });
  } else {
    // fall back to the far end of the station's edge (which way the road runs)
    const alt = graph.index.get(s.toNode);
    const altRes = alt === undefined ? null : findRoute(graph, startIndex, alt);
    routeChecks.push({
      zone: s.zone,
      ok: Boolean(altRes?.ok),
      length: altRes?.ok ? Math.round(altRes.route.length) : 0,
      seconds: altRes?.ok ? Math.round(altRes.route.duration) : 0,
      note: altRes?.ok ? 'snapped to far end of edge' : res.message,
    });
  }
}
log('route checks:\n  ' + routeChecks.map((r) => `${r.zone.padEnd(26)} ${r.ok ? `${r.length} m / ${r.seconds} s` : `UNREACHABLE — ${r.note}`}`).join('\n  '));

/* ------------------------------------------------------------------ */
/* 4. Write outputs                                                    */
/* ------------------------------------------------------------------ */

fs.mkdirSync(OUT_DIR, { recursive: true });

/** World payload keeps the render geometry only; `refs` live in the graph. */
const worldRoads = roads.map((r) => ({
  id: r.id,
  cls: r.cls,
  name: r.name,
  width: r.width,
  oneway: r.oneway,
  bridge: r.bridge,
  tunnel: r.tunnel,
  pts: r.pts,
}));

const world = {
  meta: {
    kind: 'lagos-world',
    version: 1,
    snapshot: OSM_SOURCE.snapshot,
    source: OSM_SOURCE.url,
    license: OSM_SOURCE.license,
    attribution: OSM_SOURCE.attribution,
    bounds: BOUNDS,
    /**
     * The area the car is designed to drive in. `worldBounds` is deliberately
     * larger (margin), so no curated road visibly stops at the edge of play.
     * The map camera fits `playable`, not the whole world or the old district.
     */
    playable: {
      bounds: PLAYABLE,
      world: playableWorld,
      size: { width: playableWorld.maxX - playableWorld.minX, depth: playableWorld.maxZ - playableWorld.minZ },
    },
    curation: {
      curated: true,
      inputWays: curation.stats.inputWays,
      outputWays: curation.stats.outputWays,
      note: curation.stats.note,
      limitations: curation.stats.limitations,
    },
    origin: proj.origin,
    worldBounds,
    size,
    scaleAtOrigin: proj.scaleAtOrigin,
    crs: 'WGS84 → Web Mercator metres (local tangent origin at bounds centre)',
    units: 'world metres',
    chunks: CHUNKS,
    mainStreet: {
      name: mainStreet.name,
      length: mainStreet.length,
      stops: mainStreet.stations.length,
    },
    generatedAt: new Date().toISOString(),
  },
  roads: worldRoads,
  water,
  green,
  sea,
  waterwayLines,
  trees,
  lights,
  crossings,
  signals: collector.signals.reduce((acc, v, i) => {
    if (i % 2 === 0) acc.push(...worldPoint(v, collector.signals[i + 1]));
    return acc;
  }, []),
  pois,
  stations,
  mainStreet,
  spawn,
};

// Buildings are split into a CHUNKS×CHUNKS grid so the client can stream only
// the bundles around the vehicle instead of one multi-megabyte payload.
const chunkData = Array.from({ length: CHUNKS * CHUNKS }, () => []);
for (const b of buildings) {
  let cx = 0, cz = 0;
  for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
  const n = b.p.length / 2;
  const col = Math.min(CHUNKS - 1, Math.max(0, Math.floor(((cx / n) - worldBounds.minX) / size.width * CHUNKS)));
  const row = Math.min(CHUNKS - 1, Math.max(0, Math.floor(((cz / n) - worldBounds.minZ) / size.depth * CHUNKS)));
  chunkData[row * CHUNKS + col].push(b);
}

const buildingFiles = [];
chunkData.forEach((list, i) => {
  const row = Math.floor(i / CHUNKS), col = i % CHUNKS;
  const file = `lagos-buildings-${row}${col}.json`;
  const payload = { row, col, count: list.length, b: list };
  const json = JSON.stringify(payload);
  fs.writeFileSync(path.join(OUT_DIR, file), json);
  buildingFiles.push({ file, row, col, count: list.length, bytes: json.length });
});

const worldJson = JSON.stringify(world);
fs.writeFileSync(path.join(OUT_DIR, 'lagos-world.json'), worldJson);

const graphJson = JSON.stringify({
  nodes: graph.nodes,
  edges: graph.edges,
  banned: graph.banned,
  stats: graph.stats,
});
fs.writeFileSync(path.join(OUT_DIR, 'lagos-graph.json'), graphJson);

const pbfHash = createHash('sha256').update(fs.readFileSync(PBF)).digest('hex');

const provenance = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/extract-world-data.mjs',
  source: {
    name: 'Geofabrik Nigeria extract',
    url: OSM_SOURCE.url,
    file: OSM_SOURCE.file,
    bytes: pbfBytes,
    sha256: pbfHash,
    md5File: OSM_SOURCE.md5Url,
    snapshot: OSM_SOURCE.snapshot,
    license: OSM_SOURCE.license,
    attribution: OSM_SOURCE.attribution,
  },
  bounds: BOUNDS,
  boundsNote:
    'Compact playable neighbourhood: the north-west Lagos Island grid (Adeniji Adele Road, Oshodi, ' +
    'Tokunbo, Glover, Thomas and further named streets), 906 × 907 m with a 561 × 565 m ' +
    'playable core. Provisional extraction rectangle, not an official neighbourhood boundary. The previous ' +
    'Victoria Island / Ikoyi rectangle (10.0 × 9.9 km) was ~122× larger and was replaced because a ' +
    'district-scale world produced an oversized map, roads scattered over kilometres and a generic-looking car.',
  playable: PLAYABLE,
  curation: curation.stats,
  crs: {
    source: 'EPSG:4326 (WGS84)',
    world: 'Web Mercator metres, local origin at bounds centre; +X east, +Z north, +Y up',
    scaleAtOrigin: proj.scaleAtOrigin,
    distortionNote:
      'Mercator metres exceed ground metres by 0.64 % at 6.456°N (and vary by < 0.1 m across this ' +
      '0.9 km neighbourhood). Physics and mesh sizes use Mercator metres, which keeps 3D geometry ' +
      'pixel-aligned with the MapLibre basemap.',
  },
  tileArchive: {
    path: OUTPUT.pmtiles,
    builder: 'Planetiler v0.10.2, OpenMapTiles schema, maxzoom 15',
    note: 'Generated by scripts/build-tiles.mjs from the same snapshot and bounds.',
  },
  counts: {
    osmEntitiesScanned: entities,
    nodesInBounds: collector.stats.nodesInBounds,
    roadWays: roads.length,
    drivableWays: roads.filter((r) => r.drivable).length,
    roadClasses: roadStatsByClass,
    buildings: buildings.length,
    buildingsWithTagHeight: heightFromTags,
    buildingsWithLevels: heightFromLevels,
    buildingsWithEstimatedHeight: heightEstimated,
    waterPolygons: water.length,
    greenPolygons: green.length,
    seaPolygons: sea.length,
    poi: pois.length,
    trees: trees.length,
    streetLights: lights.length,
    trafficSignals: collector.stats.signals,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    graphComponents: graph.stats.components.length,
    pedestrianCrossings: crossings.length,
    turnRestrictionsApplied: graph.banned.length,
    stations: stations.length,
  },
  quality: {
    collector: collector.stats,
    coast: { rings: coast.rings.length, closed: coast.closed, boundaryClosures: coast.boundaryClosures, dropped: coast.dropped },
    heightCoverage: {
      tagged: heightFromTags,
      fromLevels: heightFromLevels,
      estimated: heightEstimated,
      estimatedShare: Number((heightEstimated / Math.max(1, buildings.length)).toFixed(3)),
      note:
        'OSM has sparse height data here. Every estimate is deterministic (hash of the OSM id) so the ' +
        'geometry is stable between runs; it is an estimate, not measured data.',
    },
    graph: {
      components: graph.stats.components.slice(0, 10),
      note: 'Small components are usually gated estates or service roads disconnected from public roads.',
    },
    routes: routeChecks,
    knownLimitations: [
      'Multipolygon inner rings (courtyards, holes) are dropped; outer rings only.',
      'Turn restrictions whose via member is a way are skipped (counted in collector.restrictionsSkippedViaWay).',
      'Buildings crossing the extraction bounds are skipped rather than clipped (buildingsDroppedBoundary).',
      'Street trees and streetlights are generated deterministically along road centrelines — they are not OSM objects.',
      'No terrain elevation is modelled: Lagos is coastal plain and the scene uses a flat ground plane at 0 m.',
    ],
  },
  outputs: {
    world: { file: 'public/data/lagos-world.json', bytes: worldJson.length },
    graph: { file: 'public/data/lagos-graph.json', bytes: graphJson.length },
    buildings: buildingFiles,
  },
};

fs.writeFileSync(path.join(OUT_DIR, 'lagos-provenance.json'), JSON.stringify(provenance, null, 2));

log('wrote:');
log(`  public/data/lagos-world.json      ${(worldJson.length / 1048576).toFixed(2)} MiB`);
log(`  public/data/lagos-graph.json      ${(graphJson.length / 1048576).toFixed(2)} MiB`);
for (const f of buildingFiles) log(`  public/data/${f.file}  ${f.count} buildings, ${(f.bytes / 1048576).toFixed(2)} MiB`);
log(`  public/data/lagos-provenance.json`);
log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
