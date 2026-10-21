/**
 * Purpose-built buildings for the portfolio stops.
 *
 * The OSM footprints describe the neighbourhood, not the portfolio. Every
 * project needs its own designed address on the main street, so this module
 * places one curated building per station:
 *
 *   - a rectangular plot on the side of the street with the most free space,
 *   - a frontage aligned to the street, with the entrance facing the road,
 *   - a forecourt with two perpendicular parking bays,
 *   - a deterministic footprint that is also used for collision.
 *
 * The placement is pure and seeded by the station, so the building seen in the
 * browser, the collision box and the map footprint are the same geometry.
 * Original OSM footprints that fall inside a plot are removed at load time:
 * that is what turns a crowded block into a buildable address.
 */

import type { StationData } from './types';

export type ShopStyle = 'shopfront' | 'studio' | 'gallery' | 'office' | 'clinic' | 'pavilion';

export type FootprintRect = { x: number; z: number; w: number; d: number; yaw: number };

export type ProjectBuilding = {
  zone: string;
  label: string;
  address: string;
  color: string;
  style: ShopStyle;
  /** Centre of the building footprint. */
  x: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  height: number;
  /** +1 / -1 side of the street, 0 for a pavilion on the centreline. */
  side: 1 | -1;
  /** Distance from the street centreline to the front façade. */
  frontOffset: number;
  /** CCW ring [x,z,…] used for rendering and collision. */
  footprint: number[];
  /** Plot ring including the forecourt, used to clear OSM buildings. */
  plot: number[];
  front: { x: number; z: number; nx: number; nz: number; width: number };
  /** Where the route ends: the station marker on the carriageway. */
  roadPoint: { x: number; z: number; heading: number };
  /** Kerbside wayfinding pylon in front of the entrance. */
  pylon: { x: number; z: number; footprint: number[] };
  door: { x: number; z: number };
  parked: { x: number; z: number; yaw: number; footprint: number[] }[];
};

export type PlacementOptions = {
  /** Half-width of the carriageway, metres. */
  roadHalfWidth: number;
  /** Building front distance from the centreline, metres. */
  frontOffset: number;
  playable: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const DEFAULT_OPTIONS: PlacementOptions = {
  roadHalfWidth: 7.5,
  frontOffset: 15,
  playable: { minX: -280, maxX: 280, minZ: -282, maxZ: 282 },
};

/** Deterministic 0..1 from a string. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** World point from street-local (along, across) coordinates. */
function localToWorld(
  cx: number,
  cz: number,
  yaw: number,
  along: number,
  across: number
): { x: number; z: number } {
  // yaw 0 faces +Z. Right of travel is (cos yaw, -sin yaw), forward is
  // (sin yaw, cos yaw). `across` is positive toward the chosen side.
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { x: cx + rx * across + fx * along, z: cz + rz * across + fz * along };
}

/** CCW oriented rectangle ring. */
export function orientedRect(cx: number, cz: number, w: number, d: number, yaw: number): number[] {
  const corners: [number, number][] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  const out: number[] = [];
  for (const [along, across] of corners) {
    const p = localToWorld(cx, cz, yaw, along, across);
    out.push(Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100);
  }
  return out;
}

function bbox(p: number[]): { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let cx = 0, cz = 0;
  const n = p.length / 2;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minZ = Math.min(minZ, p[i + 1]);
    maxZ = Math.max(maxZ, p[i + 1]);
    cx += p[i];
    cz += p[i + 1];
  }
  return { minX, maxX, minZ, maxZ, cx: cx / n, cz: cz / n };
}

function overlaps(a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: ReturnType<typeof bbox>, pad = 0): boolean {
  return !(a.maxX + pad < b.minX || a.minX - pad > b.maxX || a.maxZ + pad < b.minZ || a.minZ - pad > b.maxZ);
}

function contained(box: { minX: number; maxX: number; minZ: number; maxZ: number }, p: number[]): boolean {
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < box.minX || p[i] > box.maxX || p[i + 1] < box.minZ || p[i + 1] > box.maxZ) return false;
  }
  return true;
}

/** Style from the station's position in the street, so the row has rhythm. */
function styleFor(zone: string, index: number): ShopStyle {
  if (zone === 'home') return 'pavilion';
  if (zone === 'about') return 'gallery';
  if (zone === 'skills') return 'studio';
  if (zone === 'contact') return 'office';
  const byIndex: ShopStyle[] = ['shopfront', 'office', 'gallery', 'clinic', 'studio'];
  return byIndex[index % byIndex.length];
}

const PALETTE = ['#d8f851', '#6de0dd', '#ffb467', '#ff7863', '#cdd5ce'];

/**
 * Place one designed building per station.
 *
 * `originals` are the OSM footprints. They are not removed here; they are only
 * used to score free space. `clearPlots` (below) is the removal step.
 */
export function placeProjectBuildings(
  stations: StationData[],
  originals: number[][],
  options: Partial<PlacementOptions> = {}
): ProjectBuilding[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalBoxes = originals.map((p) => bbox(p));
  const taken: ReturnType<typeof bbox>[] = [];
  const out: ProjectBuilding[] = [];

  stations.forEach((station, index) => {
    if (!station.zone) return;
    const seed = hash01(`${station.zone}:${index}`);
    const isPavilion = station.zone === 'home';
    const width = isPavilion ? 14 : 15 + (index % 3) * 2.4;
    const depth = isPavilion ? 8 : 9.5 + (index % 2) * 2.2;
    const height = isPavilion ? 5.2 : 9.5 + ((index * 7) % 4) * 2.1;
    const style = styleFor(station.zone, index);

    let best: { side: 1 | -1; extra: number; score: number } | null = null;
    for (const side of [-1, 1] as const) {
      for (const extra of [0, 4, 8]) {
        const frontOffset = opts.frontOffset + extra;
        const centreOffset = frontOffset + depth / 2;
        const c = localToWorld(station.x, station.z, station.heading, 0, side * centreOffset);
        const footprint = orientedRect(c.x, c.z, width, depth, station.heading);
        const box = bbox(footprint);
        // The plot reaches from the building front back to the sidewalk.
        if (!contained(opts.playable, footprint)) {
          continue;
        }
        let collisions = 0;
        for (const b of originalBoxes) if (overlaps(box, b, 1.5)) collisions++;
        for (const b of taken) if (overlaps(box, b, 2.5)) collisions += 3;
        // Slight preference for the first side (the visual "front" of the
        // street) and for keeping the frontage close to the kerb.
        const score = collisions * 100 + extra * 2 + (side === -1 ? 1 : 0) + seed * 0.01;
        if (!best || score < best.score) best = { side, extra, score };
      }
    }
    const side: 1 | -1 = best?.side ?? 1;
    const frontOffset = opts.frontOffset + (best?.extra ?? 0);
    const centreOffset = frontOffset + depth / 2;
    const centre = localToWorld(station.x, station.z, station.heading, 0, side * centreOffset);
    const footprint = orientedRect(centre.x, centre.z, width, depth, station.heading);
    const plotFront = opts.roadHalfWidth + 2.2;
    const plotCentre = localToWorld(
      station.x,
      station.z,
      station.heading,
      0,
      side * ((plotFront + centreOffset + depth / 2) / 2)
    );
    const plot = orientedRect(
      plotCentre.x,
      plotCentre.z,
      width + 4.6,
      Math.max(2, centreOffset + depth / 2 - plotFront),
      station.heading
    );
    taken.push(bbox(footprint));

    const frontPoint = localToWorld(station.x, station.z, station.heading, 0, side * frontOffset);
    const frontNormal = localToWorld(0, 0, station.heading, 0, -side);
    const doorLocal = localToWorld(station.x, station.z, station.heading, width * 0.3, side * frontOffset);
    const pylonPoint = localToWorld(station.x, station.z, station.heading, -width * 0.32, side * (frontOffset - 1.5));

    // Two perpendicular bays between the façade and the kerb. They are
    // deliberately outside the carriageway, on the same side as the entrance.
    const parked: ProjectBuilding['parked'] = [];
    if (!isPavilion) {
      for (const along of [-width / 2 + 2.3, width / 2 - 2.3]) {
        const p = localToWorld(station.x, station.z, station.heading, along, side * (frontOffset - 2.6));
        const yaw = Math.atan2(side * Math.cos(station.heading), -side * Math.sin(station.heading));
        parked.push({ x: p.x, z: p.z, yaw, footprint: orientedRect(p.x, p.z, 1.95, 4.5, yaw) });
      }
    }

    out.push({
      zone: station.zone,
      label: station.label,
      address: station.address ?? station.road ?? 'Adeniji Adele Road',
      color: PALETTE[index % PALETTE.length],
      style,
      x: centre.x,
      z: centre.z,
      yaw: station.heading,
      width,
      depth,
      height,
      side,
      frontOffset,
      footprint,
      plot,
      front: { x: frontPoint.x, z: frontPoint.z, nx: frontNormal.x, nz: frontNormal.z, width },
      roadPoint: { x: station.x, z: station.z, heading: station.heading },
      pylon: { x: pylonPoint.x, z: pylonPoint.z, footprint: orientedRect(pylonPoint.x, pylonPoint.z, 0.6, 0.6, station.heading) },
      door: doorLocal,
      parked,
    });
  });

  return out;
}

export type ClearedBuildings = {
  footprints: number[][];
  removed: number;
};

/**
 * Remove OSM footprints that sit inside a project plot or its forecourt.
 *
 * The removed rectangles are not arbitrary: each one is reported, so the UI and
 * the report can be honest that a delivered address replaced surveyed fabric.
 */
export function clearProjectPlots(
  footprints: number[][],
  buildings: ProjectBuilding[]
): ClearedBuildings {
  if (!buildings.length) return { footprints, removed: 0 };
  const plots = buildings.map((b) => ({ box: bbox(b.plot), cx: b.x, cz: b.z }));
  const kept: number[][] = [];
  let removed = 0;
  for (const p of footprints) {
    const b = bbox(p);
    let inside = false;
    for (const plot of plots) {
      if (b.cx >= plot.box.minX && b.cx <= plot.box.maxX && b.cz >= plot.box.minZ && b.cz <= plot.box.maxZ) {
        inside = true;
        break;
      }
      if (overlaps(plot.box, b, -1.5)) {
        inside = true;
        break;
      }
    }
    if (inside) removed++;
    else kept.push(p);
  }
  return { footprints: kept, removed };
}

/** All solid footprints for the collision grid: kept OSM + project shells + parked cars. */
export function projectCollisionFootprints(buildings: ProjectBuilding[]): number[][] {
  const out: number[][] = [];
  for (const b of buildings) {
    out.push(b.footprint);
    out.push(b.pylon.footprint);
    for (const car of b.parked) out.push(car.footprint);
  }
  return out;
}
