import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hydrateGraph, findRoute, snapToGraph } from '../lib/geo/graph.ts';
import { planToStation } from '../lib/world/autopilot.ts';
import { createCar } from '../lib/world/vehicle.ts';
import type { BuildingChunk, GraphPayload, Provenance, WorldData } from '../lib/world/types.ts';

/**
 * Integration tests over the *shipped* artifacts.
 *
 * These checks encode the correction this revision is about: a compact
 * 400–600 m playable neighbourhood, destinations inside it, one connected
 * road graph, routes that stay on mapped asphalt, and a map archive that is
 * clipped to the same place. The earlier district-scale build passed a build
 * but failed every one of those properties.
 */

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) as T;
}

const world = read<WorldData>('lagos-world.json');
const payload = read<GraphPayload>('lagos-graph.json');
const provenance = read<Provenance>('lagos-provenance.json');
const graph = hydrateGraph(payload);
const playable = world.meta.playable;

const chunks: BuildingChunk[] = [];
for (let row = 0; row < world.meta.chunks; row++) {
  for (let col = 0; col < world.meta.chunks; col++) {
    const file = `lagos-buildings-${row}${col}.json`;
    if (!fs.existsSync(path.join(dataDir, file))) continue;
    chunks.push(read<BuildingChunk>(file));
  }
}
const buildings: number[][] = chunks.flatMap((c) => c.b.map((b) => b.p));

/** Spatial index over building footprints so the route check stays fast. */
const CELL = 50;
const buildingGrid = new Map<string, { p: number[]; minX: number; maxX: number; minZ: number; maxZ: number }[]>();
for (const p of buildings) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minX) minX = p[i];
    if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minZ) minZ = p[i + 1];
    if (p[i + 1] > maxZ) maxZ = p[i + 1];
  }
  const entry = { p, minX, maxX, minZ, maxZ };
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const key = `${cx},${cz}`;
      const list = buildingGrid.get(key);
      if (list) list.push(entry); else buildingGrid.set(key, [entry]);
    }
  }
}

function insideBuilding(x: number, z: number): boolean {
  const list = buildingGrid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (!list) return false;
  for (const b of list) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (insidePolygon(x, z, b.p)) return true;
  }
  return false;
}

function insidePolygon(x: number, z: number, p: number[]): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1];
    const xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test('world is a compact 400–600 m playable neighbourhood', () => {
  assert.equal(world.meta.license, 'ODbL-1.0 (OpenStreetMap Foundation)');
  assert.equal(world.meta.snapshot, '2026-10-15T20:21:00Z');
  assert.ok(world.meta.attribution.includes('OpenStreetMap'));
  assert.ok(playable, 'meta.playable is required: the map fits this, not the extraction margin');
  assert.ok(playable!.size.width >= 400 && playable!.size.width <= 650, `playable width ${playable!.size.width}`);
  assert.ok(playable!.size.depth >= 400 && playable!.size.depth <= 650, `playable depth ${playable!.size.depth}`);
  assert.ok(world.meta.size.width <= 1000 && world.meta.size.depth <= 1000, 'extraction should stay under 1 km');
  assert.ok(provenance.source.sha256.length === 64);
});

test('the curated network is dense enough to drive, not scattered fragments', () => {
  assert.ok(world.roads.length >= 60, `roads ${world.roads.length}`);
  assert.ok(world.roads.length <= 400, `too many roads for a compact world: ${world.roads.length}`);
  let metres = 0;
  for (const road of world.roads) {
    assert.ok(road.width >= 5.4, `${road.name ?? road.id} is only ${road.width} m wide`);
    assert.ok(road.pts.length >= 4, `road ${road.id} has no geometry`);
    for (let i = 2; i < road.pts.length; i += 2) {
      metres += Math.hypot(road.pts[i] - road.pts[i - 2], road.pts[i + 1] - road.pts[i - 1]);
    }
  }
  assert.ok(metres > 6000, `only ${metres.toFixed(0)} m of drivable road`);
  assert.ok(metres < 45000, `${metres.toFixed(0)} m is more than a compact neighbourhood`);
  const named = world.roads.filter((r) => r.name).length;
  assert.ok(named >= 20, `named streets ${named}`);
  assert.ok(world.trees.length >= 250, `trees ${world.trees.length}`);
  assert.ok(world.lights.length >= 20, `surveyed streetlights ${world.lights.length}`);
});

test('building bundles are present, varied and plausible', () => {
  assert.ok(buildings.length >= 500, `buildings ${buildings.length}`);
  assert.equal(chunks.length, world.meta.chunks ** 2, 'every building bundle must load');
  const heights = chunks.flatMap((c) => c.b.map((b) => b.h));
  assert.ok(Math.max(...heights) > 20, 'the neighbourhood should include taller buildings');
  assert.ok(new Set(heights.map((h) => Math.round(h))).size >= 8, 'heights should not be one repeated value');
  assert.ok(heights.filter((h) => h >= 15).length > 10, 'the neighbourhood should include mid-rise buildings');
  for (const b of chunks.flatMap((c) => c.b).slice(0, 1000)) {
    assert.ok(b.h >= 2 && b.h <= 140, `height ${b.h}`);
    assert.ok(b.p.length >= 6 && b.p.length % 2 === 0);
  }
});

test('every station is inside the playable area, on the road network', () => {
  assert.equal(world.stations.length, 18);
  assert.ok(playable);
  for (const station of world.stations) {
    assert.ok(
      station.x >= playable!.world.minX && station.x <= playable!.world.maxX &&
        station.z >= playable!.world.minZ && station.z <= playable!.world.maxZ,
      `${station.label} is outside the playable area (${station.x.toFixed(1)}, ${station.z.toFixed(1)})`
    );
    assert.ok(station.road, `${station.label} has no road name/class`);
    assert.ok(station.snapDistance < 2, `${station.label} off-road by ${station.snapDistance} m`);
    const snap = snapToGraph(graph, station.x, station.z);
    assert.ok(snap.distance < 2.5, `${station.label} node snap ${snap.distance}`);
  }
});

test('the road graph is a single connected component', () => {
  assert.ok(graph.nodes.length >= 100, `nodes ${graph.nodes.length}`);
  assert.ok(graph.edges.length >= 120, `edges ${graph.edges.length}`);
  assert.equal(graph.stats.components.length, 1, `disconnected components: ${graph.stats.components.join(', ')}`);
  assert.equal(graph.stats.components[0], graph.nodes.length);
});

test('every destination is reachable from the spawn point', () => {
  assert.ok(world.spawn);
  const spawnNode = world.spawn!.nodeIndex;
  const car = createCar({ x: world.spawn!.x, z: world.spawn!.z, yaw: world.spawn!.yaw });
  for (const station of world.stations) {
    if (station.zone === 'home') continue;
    const direct = findRoute(graph, spawnNode, station.nodeIndex);
    assert.ok(direct.ok, `${station.label} unreachable: ${direct.ok ? '' : direct.message}`);
    if (!direct.ok) continue;
    assert.ok(direct.route.length > 40, `${station.label} route ${direct.route.length} m`);

    const plan = planToStation(graph, car, station);
    assert.ok(plan.ok, `${station.label} plan: ${plan.ok ? '' : plan.message}`);
    if (!plan.ok) continue;
    const end = plan.route.p.slice(-2);
    const gap = Math.hypot(end[0] - station.x, end[1] - station.z);
    assert.ok(gap < 5, `${station.label} route ends ${gap.toFixed(1)} m from the station`);
  }
});

test('planned routes follow mapped roads and avoid buildings', () => {
  const spawn = world.spawn!;
  const car = createCar({ x: spawn.x, z: spawn.z, yaw: spawn.yaw });
  let checked = 0;
  let inside = 0;
  for (const station of world.stations) {
    if (station.zone === 'home') continue;
    const plan = planToStation(graph, car, station);
    assert.ok(plan.ok, `${station.label}: ${plan.ok ? '' : plan.message}`);
    if (!plan.ok) continue;
    const p = plan.route.p;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], z = p[i + 1];
      const snap = snapToGraph(graph, x, z);
      assert.ok(snap.distance < 1.5, `${station.label}: route vertex ${snap.distance.toFixed(2)} m off the road`);
      if (insideBuilding(x, z)) inside++;
      checked++;
    }
  }
  assert.ok(checked > 60, `only ${checked} vertices checked`);
  assert.ok(inside / checked < 0.02, `${inside}/${checked} route vertices fall inside building footprints`);
});

test('provenance documents the pipeline outputs and limitations', () => {
  assert.ok(String(provenance.crs.world).includes('Web Mercator'));
  assert.ok(provenance.outputs.world);
  const quality = provenance.quality as { knownLimitations?: string[] };
  assert.ok(Array.isArray(quality.knownLimitations));
  assert.ok((quality.knownLimitations ?? []).length >= 4);
});
