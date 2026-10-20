import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjection, haversineMetres, latitudeFromMercatorZ, mercatorZ } from '../lib/geo/projection.ts';

const BOUNDS = { west: 3.365, south: 6.412, east: 3.455, north: 6.5 };

test('projection origin is the bounds centre and maps to (0, 0)', () => {
  const p = createProjection(BOUNDS);
  const o = p.toWorld(p.origin.lng, p.origin.lat);
  assert.ok(Math.abs(o.x) < 1e-6 && Math.abs(o.z) < 1e-6, `origin maps to ${o.x},${o.z}`);
});

test('world bounds match the projected extents', () => {
  const p = createProjection(BOUNDS);
  const sw = p.toWorld(BOUNDS.west, BOUNDS.south);
  const ne = p.toWorld(BOUNDS.east, BOUNDS.north);
  assert.ok(Math.abs(sw.x - p.worldBounds.minX) < 1e-6);
  assert.ok(Math.abs(ne.x - p.worldBounds.maxX) < 1e-6);
  assert.ok(Math.abs(sw.z - p.worldBounds.minZ) < 1e-6);
  assert.ok(Math.abs(ne.z - p.worldBounds.maxZ) < 1e-6);
  assert.ok(p.size.width > 9000 && p.size.width < 11000, `width ${p.size.width}`);
  assert.ok(p.size.depth > 9000 && p.size.depth < 11000, `depth ${p.size.depth}`);
});

test('lng/lat round-trips through world coordinates', () => {
  const p = createProjection(BOUNDS);
  const samples = [
    [3.4211, 6.4288],
    [3.365, 6.412],
    [3.455, 6.5],
    [3.4101, 6.4559],
  ];
  for (const [lng, lat] of samples) {
    const w = p.toWorld(lng, lat);
    const back = p.toLatLng(w.x, w.z);
    assert.ok(Math.abs(back.lng - lng) < 1e-9, `lng ${lng} -> ${back.lng}`);
    assert.ok(Math.abs(back.lat - lat) < 1e-9, `lat ${lat} -> ${back.lat}`);
  }
});

test('Mercator scale at this latitude is ~1.0064 and documented', () => {
  const p = createProjection(BOUNDS);
  assert.ok(Math.abs(p.scaleAtOrigin - 1.0064) < 0.001, `scale ${p.scaleAtOrigin}`);
  assert.ok(Math.abs(p.groundMetresPerWorldMetre - 1 / p.scaleAtOrigin) < 1e-9);
});

test('world distances match ground distances within the documented Mercator factor', () => {
  const p = createProjection(BOUNDS);
  const a = { lng: 3.4100, lat: 6.4500 };
  const b = { lng: 3.4100, lat: 6.4600 };
  const wa = p.toWorld(a.lng, a.lat);
  const wb = p.toWorld(b.lng, b.lat);
  const world = Math.hypot(wb.x - wa.x, wb.z - wa.z);
  const ground = haversineMetres(a, b);
  const ratio = world / ground;
  assert.ok(ratio > 1.0 && ratio < 1.01, `ratio ${ratio}`);
  // 0.01° of latitude is ~1113 m
  assert.ok(Math.abs(ground - 1113) < 12, `ground ${ground}`);
});

test('inverse Mercator latitude is stable at the edges', () => {
  for (const lat of [6.412, 6.456, 6.5]) {
    assert.ok(Math.abs(latitudeFromMercatorZ(mercatorZ(lat)) - lat) < 1e-10);
  }
});
