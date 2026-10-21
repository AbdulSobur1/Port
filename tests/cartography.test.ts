import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projects } from '../lib/projects.ts';
import {
  buildMapModel,
  clampView,
  distanceToPolyline,
  fitView,
  hitStation,
  orderedStations,
  rectOfPolyline,
  simplify,
  toScreen,
  toWorld,
  viewRect,
  zoomView,
  type MapSize,
} from '../lib/world/cartography.ts';
import type { BuildingChunk, WorldData } from '../lib/world/types.ts';

/**
 * The map is only trustworthy if it is derived from the playable world. These
 * tests read the shipped artifacts, not mocks, and check the properties the
 * panel depends on: one street, every project on it, markers inside the fitted
 * viewport, and an exact screen ↔ world transform.
 */

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const world = JSON.parse(fs.readFileSync(path.join(dataDir, 'lagos-world.json'), 'utf8')) as WorldData;

const buildings: BuildingChunk['b'] = [];
for (let row = 0; row < world.meta.chunks; row++) {
  for (let col = 0; col < world.meta.chunks; col++) {
    const file = `lagos-buildings-${row}${col}.json`;
    const p = path.join(dataDir, file);
    if (!fs.existsSync(p)) continue;
    buildings.push(...(JSON.parse(fs.readFileSync(p, 'utf8')) as BuildingChunk).b);
  }
}

const model = buildMapModel(world, buildings);
const DESKTOP: MapSize = { width: 360, height: 240 };
const MOBILE: MapSize = { width: 340, height: 210 };
const EXPANDED_DESKTOP: MapSize = { width: 1280, height: 720 };
const EXPANDED_MOBILE: MapSize = { width: 390, height: 720 };

test('the map is built from the drivable network, not a second map', () => {
  assert.equal(model.roads.length, world.roads.length);
  assert.ok(model.roads.every((r) => r.p.length >= 4));
  assert.ok(model.roads.every((r) => r.width >= 5.6), 'no sliver roads on the plan');
  assert.equal(model.buildings.length, buildings.length);
  assert.ok(model.street, 'the world must ship one main street');
  assert.ok(model.roads.some((r) => r.main), 'the main street must exist in the road list');
});

test('one continuous main street carries every portfolio stop in order', () => {
  const street = world.mainStreet;
  assert.ok(street);
  const stations = orderedStations(world.stations);
  assert.equal(stations.length, projects.length + 4, 'home + projects + about/skills/contact');

  let previous = -Infinity;
  for (const station of stations) {
    const offset = station.streetOffset ?? -1;
    assert.ok(offset >= previous, `${station.zone} is out of street order`);
    previous = offset;
    assert.ok(station.road === street!.name, `${station.zone} is not on the main street`);
    const gap = distanceToPolyline(station.x, station.z, street!.p);
    assert.ok(gap <= 1.5, `${station.zone} is ${gap.toFixed(2)} m from the street centreline`);
  }

  for (const project of projects) {
    const station = world.stations.find((s) => s.zone === `project:${project.slug}`);
    assert.ok(station, `${project.title} has no stop on the street`);
    assert.equal(station.label, project.title);
    assert.ok(station.address, `${project.title} has no address`);
  }
});

test('every stop marker sits on a road the car can drive', () => {
  for (const station of model.stations) {
    const road = model.roads.find((r) => distanceToPolyline(station.x, station.z, r.p) <= r.width / 2 + 0.6);
    assert.ok(road, `${station.zone} is not on any drivable carriageway`);
  }
});

test('screen and world transforms are exact inverses', () => {
  for (const turn of [0, 1] as const) {
    const view = { x: 12.5, z: -40.25, scale: 1.87, turn };
    for (const size of [DESKTOP, MOBILE, EXPANDED_DESKTOP]) {
      for (const [x, z] of [[0, 0], [-260, 180], [140.5, -320.75]] as const) {
        const p = toScreen(view, size, x, z);
        const back = toWorld(view, size, p.x, p.y);
        assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9, `turn ${turn}`);
      }
    }
  }
});

test('portrait expanded view turns the plan and still fits every stop', () => {
  const size = { width: 390, height: 780 };
  const flat = fitView(model.streetExtent, size, 30, 0);
  const turned = fitView(model.streetExtent, size, 30, 1);
  assert.ok(turned.scale > flat.scale * 1.6, 'the turned plan must use the tall viewport');
  for (const station of model.stations) {
    const p = toScreen(turned, size, station.x, station.z);
    assert.ok(p.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height, `${station.zone} is off-screen in the turned view`);
  }
  // World east must run down the screen with the same handedness as north-up.
  const origin = toScreen(turned, size, 0, 0);
  const east = toScreen(turned, size, 100, 0);
  const north = toScreen(turned, size, 0, 100);
  assert.ok(east.y < origin.y, 'east must run up the turned screen');
  assert.ok(north.x > origin.x, 'north must point right in the turned view');
});

test('north is up and the car marker follows the car', () => {
  const view = { x: 0, z: 0, scale: 2 };
  const north = toScreen(view, DESKTOP, 0, 100);
  assert.ok(north.y < DESKTOP.height / 2, 'north must be up the screen');
  const east = toScreen(view, DESKTOP, 100, 0);
  assert.ok(east.x > DESKTOP.width / 2, 'east must be right of centre');
});

test('the whole portfolio street fits the expanded viewport on desktop and mobile', () => {
  for (const size of [EXPANDED_DESKTOP, EXPANDED_MOBILE]) {
    const view = fitView(model.streetExtent, size, 30);
    for (const station of model.stations) {
      const p = toScreen(view, size, station.x, station.z);
      assert.ok(p.x >= 0 && p.x <= size.width, `${station.zone} is off-screen horizontally at ${size.width}px`);
      assert.ok(p.y >= 0 && p.y <= size.height, `${station.zone} is off-screen vertically at ${size.height}px`);
    }
    // And the street itself, not only its stops.
    for (let i = 0; i < world.mainStreet!.p.length; i += 2) {
      const p = toScreen(view, size, world.mainStreet!.p[i], world.mainStreet!.p[i + 1]);
      assert.ok(p.x >= -1 && p.x <= size.width + 1 && p.y >= -1 && p.y <= size.height + 1);
    }
  }
});

test('the compact minimap centres the car and shows its surroundings', () => {
  const car = { x: -120, z: 60 };
  const view = { x: car.x, z: car.z, scale: 2.1 };
  const p = toScreen(view, DESKTOP, car.x, car.z);
  assert.equal(Math.round(p.x), DESKTOP.width / 2);
  assert.equal(Math.round(p.y), DESKTOP.height / 2);
  assert.ok(view.scale * DESKTOP.height > 80, 'the minimap must show more than one car length');
});

test('zoom keeps the point under the cursor fixed, and panning is clamped to the world', () => {
  const size = EXPANDED_DESKTOP;
  const view = fitView(model.streetExtent, size, 30);
  const anchor = { x: 400, y: 300 };
  const before = toWorld(view, size, anchor.x, anchor.y);
  const zoomed = zoomView(view, size, 1.6, anchor);
  const after = toWorld(zoomed, size, anchor.x, anchor.y);
  assert.ok(Math.abs(before.x - after.x) < 0.01 && Math.abs(before.z - after.z) < 0.01);

  const far = clampView({ x: 9000, z: -9000, scale: 2 }, model.extent, size, 0.1);
  const visible = viewRect(far, size);
  assert.ok(visible.minX < model.extent.maxX, 'the world must stay reachable when panning');
  assert.ok(visible.maxZ > model.extent.minZ, 'the world must stay reachable when panning');
});

test('station hit-testing resolves the nearest marker only', () => {
  const size = EXPANDED_DESKTOP;
  const view = fitView(model.streetExtent, size, 30);
  const station = model.stations[2];
  const p = toScreen(view, size, station.x, station.z);
  const hit = hitStation(view, size, model.stations, p.x + 2, p.y - 2, 18);
  assert.equal(hit?.zone, station.zone);
  assert.equal(hitStation(view, size, model.stations, -200, -200, 18), null);
});

test('polyline simplification keeps endpoints and respects tolerance', () => {
  const street = world.mainStreet!.p;
  const simplified = simplify(street, 0.5);
  assert.equal(simplified[0], street[0]);
  assert.equal(simplified[1], street[1]);
  assert.equal(simplified[simplified.length - 2], street[street.length - 2]);
  assert.equal(simplified[simplified.length - 1], street[street.length - 1]);
  assert.ok(simplified.length <= street.length);
});

test('the map framing covers the street extent, not a district', () => {
  const street = rectOfPolyline(world.mainStreet!.p);
  assert.ok(model.streetExtent.minX <= street.minX && model.streetExtent.maxX >= street.maxX);
  assert.ok(model.streetExtent.minZ <= street.minZ && model.streetExtent.maxZ >= street.maxZ);
  const width = model.streetExtent.maxX - model.streetExtent.minX;
  const depth = model.streetExtent.maxZ - model.streetExtent.minZ;
  assert.ok(width < 700 && depth < 400, 'the map must not expose the whole district');
});

test('no station marker is inside a building footprint', () => {
  const inside = (x: number, z: number, p: number[]) => {
    let hit = false;
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1];
      const xj = p[j * 2], zj = p[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) hit = !hit;
    }
    return hit;
  };
  for (const station of model.stations) {
    for (const building of model.buildings) {
      assert.ok(!inside(station.x, station.z, building.p), `${station.zone} is inside a building`);
    }
  }
});
