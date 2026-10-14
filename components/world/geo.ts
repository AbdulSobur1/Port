/**
 * The single, documented coordinate system for the world.
 *
 * WORLD SPACE (the space the renderer and physics engine share)
 * ---------------------------------------------------------------------------
 * - Right-handed, measured in **metres**.
 * - `+X` = east, `+Z` = north, `+Y` = up.
 * - `(0, 0)` is the centre of the city plaza (`world-layout.ts` landmark).
 * - Every `WorldLayout` is bounded to `±bounds` metres (see `world-layout.ts`).
 *
 * GEOGRAPHIC SPACE
 * ---------------------------------------------------------------------------
 * - WGS84 decimal degrees (`lat`, `lng`).
 * - The world is anchored at `WORLD_ORIGIN`, so `(0, 0)` maps to a real point on
 *   Earth. The default is central Abuja, Nigeria and can be overridden at build
 *   time with `NEXT_PUBLIC_WORLD_ORIGIN="lat,lng"` — no code change required.
 *
 * PROJECTION
 * ---------------------------------------------------------------------------
 * - A local **equirectangular** (plate carrée) projection around the origin.
 *   Over a city footprint of a few hundred metres this is accurate to well under
 *   a centimetre, while staying trivially invertible and testable. It is *not*
 *   valid far from the origin, which is exactly the scope of this world.
 * - `metersPerDegreeLat/Lng` use the full WGS84 series expansion, so the scale is
 *   correct at any latitude, not just the equator.
 *
 * This module is free of React and three.js so it can be unit-tested in Node.
 */

export type LatLng = { lat: number; lng: number };
export type WorldPoint = { x: number; z: number };

const DEG_TO_RAD = Math.PI / 180;

/** Web-Mercator ground resolution constant (metres per pixel at zoom 0, equator). */
const WEBMERCATOR_PIXELS = 256;
const EARTH_CIRCUMFERENCE = 40075016.686;
const METERS_PER_PIXEL_Z0 = EARTH_CIRCUMFERENCE / WEBMERCATOR_PIXELS; // 156543.03392

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function parseOrigin(): LatLng {
  const raw = process.env.NEXT_PUBLIC_WORLD_ORIGIN;
  if (raw) {
    const [lat, lng] = raw.split(',').map((part) => Number(part.trim()));
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  // Abuja, Nigeria — a stable, well-known reference point.
  return { lat: 9.05785, lng: 7.49508 };
}

/** The real-world point that world `(0, 0)` projects onto. */
export const WORLD_ORIGIN: LatLng = parseOrigin();

/** Metres per degree of latitude at a given latitude (full WGS84 expansion). */
export function metersPerDegreeLat(lat: number): number {
  const p = lat * DEG_TO_RAD;
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

/** Metres per degree of longitude at a given latitude (full WGS84 expansion). */
export function metersPerDegreeLng(lat: number): number {
  const p = lat * DEG_TO_RAD;
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

/** Convert a world-space point (metres, +X east / +Z north) to geographic coordinates. */
export function worldToLatLng(point: WorldPoint, origin: LatLng = WORLD_ORIGIN): LatLng {
  const mLat = metersPerDegreeLat(origin.lat);
  const mLng = metersPerDegreeLng(origin.lat);
  return {
    lat: origin.lat + point.z / mLat,
    lng: origin.lng + point.x / mLng,
  };
}

/** Inverse of `worldToLatLng`. */
export function latLngToWorld(point: LatLng, origin: LatLng = WORLD_ORIGIN): WorldPoint {
  const mLat = metersPerDegreeLat(origin.lat);
  const mLng = metersPerDegreeLng(origin.lat);
  return {
    x: (point.lng - origin.lng) * mLng,
    z: (point.lat - origin.lat) * mLat,
  };
}

/** Geographic corners of a square world of `halfSize` metres centred on the origin. */
export function worldBoundsToLatLng(halfSize: number, origin: LatLng = WORLD_ORIGIN): { sw: LatLng; ne: LatLng } {
  return {
    sw: worldToLatLng({ x: -halfSize, z: -halfSize }, origin),
    ne: worldToLatLng({ x: halfSize, z: halfSize }, origin),
  };
}

/** Web-Mercator metres-per-pixel at a given zoom and latitude. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (METERS_PER_PIXEL_Z0 * Math.cos(lat * DEG_TO_RAD)) / 2 ** zoom;
}

/** The fractional zoom at which each pixel covers `metersPerPixel` metres. */
export function zoomForMetersPerPixel(metersPerPixel: number, lat: number): number {
  return Math.log2((METERS_PER_PIXEL_Z0 * Math.cos(lat * DEG_TO_RAD)) / metersPerPixel);
}

/** Zoom that fits `spanMeters` across `sizePx` pixels at the given latitude. */
export function zoomForSpan(spanMeters: number, sizePx: number, lat = WORLD_ORIGIN.lat): number {
  return zoomForMetersPerPixel(spanMeters / sizePx, lat);
}

/** Square canvas resolution of the real-map ground texture. */
export const MAP_CANVAS_SIZE = 1024;

/** Geographic width/height (metres) of the real-map ground texture. */
export const MAP_SPAN_METERS = 220;

/** Zoom used to render the real map at `MAP_SPAN_METERS` across `MAP_CANVAS_SIZE`. */
export const MAP_ZOOM = zoomForSpan(MAP_SPAN_METERS, MAP_CANVAS_SIZE, WORLD_ORIGIN.lat);
