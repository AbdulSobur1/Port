/**
 * One documented geographic-to-world transformation.
 *
 * World space: right-handed, units are **Web Mercator metres**.
 *   +X = east, +Z = north, +Y = up, origin (0,0) = the centre of the
 *   extraction bounds (`originLatLng`).
 *
 * We deliberately use Web Mercator metres (not a local equirectangular
 * plane) because the interactive map (MapLibre GL) is also Web Mercator:
 * every geometry derived here lands pixel-exact on the map at any zoom,
 * which is what "map/world alignment" requires. At this latitude
 * (~6.46°N) Mercator metres are a uniform 0.64 % larger than ground
 * metres (scale factor 1/cos φ); across this 0.9 km neighbourhood the
 * variation is under 0.1 m, so treating Mercator metres as metres for
 * physics and mesh sizing introduces a well-bounded, documented error.
 *
 * WGS84 datum. No vertical transformation (OSM heights are treated as
 * metres above the ground plane).
 *
 * This module is dependency-free on purpose: the same code runs in the
 * browser (R3F scene, MapLibre sync) and in Node build scripts
 * (`scripts/extract-world-data.mjs`), so the two can never diverge.
 */

export type LatLng = { lat: number; lng: number };
export type WorldPoint = { x: number; z: number };

/** WGS84 semi-major axis (metres). */
export const EARTH_RADIUS = 6378137;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Mercator north coordinate for a WGS84 latitude (metres). */
export function mercatorZ(lat: number): number {
  const phi = lat * DEG2RAD;
  return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

/** Mercator east coordinate for a WGS84 longitude (metres). */
export function mercatorX(lng: number): number {
  return EARTH_RADIUS * lng * DEG2RAD;
}

/** Inverse of {@link mercatorZ}. */
export function latitudeFromMercatorZ(z: number): number {
  return (2 * Math.atan(Math.exp(z / EARTH_RADIUS)) - Math.PI / 2) * RAD2DEG;
}

/** Inverse of {@link mercatorX}. */
export function longitudeFromMercatorX(x: number): number {
  return x * RAD2DEG / EARTH_RADIUS;
}

export type Bounds = { west: number; south: number; east: number; north: number };

export type Projection = {
  /** WGS84 centre of the world = world origin (0, 0). */
  origin: LatLng;
  /** Extraction bounds (WGS84). */
  bounds: Bounds;
  /** World-space extent of `bounds` (Mercator metres). */
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** World-space width (X) and depth (Z) in metres. */
  size: { width: number; depth: number };
  /** WGS84 → world. */
  toWorld(lng: number, lat: number): WorldPoint;
  /** World → WGS84. */
  toLatLng(x: number, z: number): LatLng;
  /**
   * Uniform Mercator-vs-ground scale factor at the origin
   * (1/cos φ). ~1.0064 at Victoria Island. Useful for reporting the
   * documented sub-1 % metric distortion.
   */
  scaleAtOrigin: number;
  /** Ground-metre length that one world metre represents at the origin. */
  groundMetresPerWorldMetre: number;
};

export function createProjection(bounds: Bounds): Projection {
  if (!(bounds.east > bounds.west) || !(bounds.north > bounds.south)) {
    throw new Error(`Invalid bounds: ${JSON.stringify(bounds)}`);
  }
  const origin: LatLng = {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
  const originX = mercatorX(origin.lng);
  const originZ = mercatorZ(origin.lat);

  const worldBounds = {
    minX: mercatorX(bounds.west) - originX,
    maxX: mercatorX(bounds.east) - originX,
    minZ: mercatorZ(bounds.south) - originZ,
    maxZ: mercatorZ(bounds.north) - originZ,
  };

  return {
    origin,
    bounds,
    worldBounds,
    size: {
      width: worldBounds.maxX - worldBounds.minX,
      depth: worldBounds.maxZ - worldBounds.minZ,
    },
    toWorld(lng: number, lat: number): WorldPoint {
      return { x: mercatorX(lng) - originX, z: mercatorZ(lat) - originZ };
    },
    toLatLng(x: number, z: number): LatLng {
      return {
        lng: longitudeFromMercatorX(x + originX),
        lat: latitudeFromMercatorZ(z + originZ),
      };
    },
    scaleAtOrigin: 1 / Math.cos(origin.lat * DEG2RAD),
    groundMetresPerWorldMetre: Math.cos(origin.lat * DEG2RAD),
  };
}

/**
 * Great-circle distance in metres between two WGS84 points.
 * Used by routing heuristics and tests (world distances can differ by
 * the documented Mercator scale factor).
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(s)));
}
