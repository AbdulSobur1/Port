import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_CANVAS_SIZE,
  MAP_SPAN_METERS,
  MAP_ZOOM,
  WORLD_ORIGIN,
  latLngToWorld,
  metersPerDegreeLat,
  metersPerDegreeLng,
  worldBoundsToLatLng,
  worldToLatLng,
  zoomForMetersPerPixel,
  zoomForSpan,
} from '../components/world/geo';

const close = (a: number, b: number, tol: number, message?: string) =>
  assert.ok(Math.abs(a - b) <= tol, message ?? `${a} not within ${tol} of ${b}`);

test('WGS84 meridional scale is near 111 km/° at the equator', () => {
  close(metersPerDegreeLat(0), 110574, 50);
});

test('WGS84 longitudinal scale matches the textbook value at the equator', () => {
  // 111,319.49 m/° at 0° latitude.
  close(metersPerDegreeLng(0), 111319.49, 1);
});

test('longitudinal scale halves near 60° latitude', () => {
  close(metersPerDegreeLng(60), 55800, 20);
});

test('world +Z (north) increases latitude and world +X (east) increases longitude', () => {
  const north = worldToLatLng({ x: 0, z: 100 });
  const east = worldToLatLng({ x: 100, z: 0 });
  assert.ok(north.lat > WORLD_ORIGIN.lat);
  close(north.lng, WORLD_ORIGIN.lng, 1e-12);
  assert.ok(east.lng > WORLD_ORIGIN.lng);
  close(east.lat, WORLD_ORIGIN.lat, 1e-12);
});

test('the world origin is the projection origin', () => {
  const origin = worldToLatLng({ x: 0, z: 0 });
  close(origin.lat, WORLD_ORIGIN.lat, 1e-12);
  close(origin.lng, WORLD_ORIGIN.lng, 1e-12);
});

test('world <-> latlng round-trips to sub-millimetre accuracy', () => {
  for (const point of [
    { x: 0, z: 0 },
    { x: 24, z: -24 },
    { x: -13.5, z: 7.25 },
    { x: 110, z: 110 },
  ]) {
    const back = latLngToWorld(worldToLatLng(point));
    close(back.x, point.x, 1e-6);
    close(back.z, point.z, 1e-6);
  }
});

test('bounds bracket the origin on every side', () => {
  const { sw, ne } = worldBoundsToLatLng(24);
  assert.ok(sw.lat < WORLD_ORIGIN.lat && WORLD_ORIGIN.lat < ne.lat);
  assert.ok(sw.lng < WORLD_ORIGIN.lng && WORLD_ORIGIN.lng < ne.lng);
});

test('zoom resolution is invertible and monotonic', () => {
  for (const zoom of [12, 16, 19, 20.5]) {
    const mpp = (MAP_SPAN_METERS / MAP_CANVAS_SIZE) * Math.pow(2, MAP_ZOOM - zoom);
    close(zoomForMetersPerPixel(mpp, WORLD_ORIGIN.lat), zoom, 1e-9);
  }
  assert.ok(zoomForSpan(50, 1024, WORLD_ORIGIN.lat) > zoomForSpan(500, 1024, WORLD_ORIGIN.lat));
});

test('the configured map view is a sane, finite zoom', () => {
  assert.ok(Number.isFinite(MAP_ZOOM));
  assert.ok(MAP_ZOOM > 15 && MAP_ZOOM < 23, `unexpected MAP_ZOOM ${MAP_ZOOM}`);
});
