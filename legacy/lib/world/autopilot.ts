/**
 * Autopilot: A* over the real road graph, then pure-pursuit steering with
 * curvature-limited speed control.
 *
 * The controller is pure: it reads the car state and the plan and returns a
 * `DriveCommand` — the same command shape the keyboard produces, so manual
 * override is simply "stop calling this and use the player's input".
 *
 * There is no straight-line fallback anywhere. If A* cannot connect the
 * current road to the destination road, planning fails and the UI explains
 * why instead of driving through a building.
 */

import type { CarState } from './vehicle.ts';
import { clamp, normalizeAngle } from './vehicle.ts';
import type { Route, RouteGraph } from '../geo/graph.ts';
import { findRoute, nearestNode, pointAlong, snapToGraph } from '../geo/graph.ts';
import type { StationData } from './types';

export type PlanFailureReason = 'no-road' | 'disconnected' | 'same-node' | 'search-limit' | 'no-graph';

export type PlanResult =
  | { ok: true; route: Route; fromNode: number; toNode: number }
  | { ok: false; reason: PlanFailureReason; message: string };

/**
 * Which edge does this station sit on?
 *
 * Newer payloads carry `edge`; older ones only carry the two OSM node ids, so
 * fall back to the edge incident to the station's near node, then to a global
 * snap. Keeping this resolution here means callers never have to know.
 */
function stationEdgeIndex(graph: RouteGraph, station: StationData): number {
  const stored = (station as StationData & { edge?: number }).edge;
  if (typeof stored === 'number' && stored >= 0 && stored < graph.edges.length) return stored;
  const incident: number[] = [];
  graph.edges.forEach((e, i) => {
    if (e.a === station.nodeIndex || e.b === station.nodeIndex) incident.push(i);
  });
  if (incident.length) {
    const snap = snapToGraph(graph, station.x, station.z, incident);
    if (snap.distance < 25) return snap.edge;
  }
  return snapToGraph(graph, station.x, station.z).edge;
}

/** Points from `fromNode` along `edge` to the station marker (excluding the start node). */
function legToStation(
  edge: { a: number; b: number; p: number[]; len: number; oneway: boolean },
  fromNode: number,
  stationS: number,
  stationX: number,
  stationZ: number
): number[][] {
  const out: number[][] = [];
  if (fromNode === edge.a) {
    let acc = 0;
    for (let i = 2; i < edge.p.length; i += 2) {
      acc += Math.hypot(edge.p[i] - edge.p[i - 2], edge.p[i + 1] - edge.p[i - 1]);
      out.push([edge.p[i], edge.p[i + 1]]);
      if (acc >= stationS) break;
    }
  } else {
    // Approaching from the b end (two-way only): walk the polyline backwards.
    let acc = edge.len;
    for (let i = edge.p.length - 4; i >= 0; i -= 2) {
      acc -= Math.hypot(edge.p[i + 2] - edge.p[i], edge.p[i + 3] - edge.p[i + 1]);
      out.push([edge.p[i], edge.p[i + 1]]);
      if (acc <= stationS) break;
    }
  }
  out.push([stationX, stationZ]);
  return out;
}

/** Route from wherever the car is to a station, entering the network at the nearest edge. */
export function planToStation(
  graph: RouteGraph,
  car: { x: number; z: number; yaw: number },
  station: StationData
): PlanResult {
  if (!graph.edges.length || !graph.nodes.length) {
    return { ok: false, reason: 'no-graph', message: 'The road graph has no drivable edges.' };
  }
  const snap = snapToGraph(graph, car.x, car.z);
  if (snap.distance > 400) {
    return {
      ok: false,
      reason: 'no-road',
      message: 'The car is too far from any mapped road to join the network.',
    };
  }
  const carEdge = graph.edges[snap.edge];
  const seIndex = stationEdgeIndex(graph, station);
  const se = graph.edges[seIndex];
  const stSnap = snapToGraph(graph, station.x, station.z, [seIndex]);

  // Enter the car's own road at either end (one-way edges only at their tail).
  const entries = carEdge.oneway ? [carEdge.a] : [carEdge.a, carEdge.b];
  // Leave the station's road at either end, but only in the legal direction.
  const approaches = se.oneway ? [se.a] : [se.a, se.b];

  let best: { route: Route; fromNode: number; viaNode: number } | null = null;
  let failure: PlanFailureReason = 'search-limit';
  let failureMessage = 'No route found.';

  for (const fromIndex of entries) {
    for (const viaNode of approaches) {
      const result = findRoute(graph, fromIndex, viaNode);
      if (!result.ok) {
        failure = result.reason === 'disconnected' ? 'disconnected' : result.reason === 'same-node' ? 'same-node' : 'search-limit';
        failureMessage = result.message;
        continue;
      }
      const route = result.route;
      const leg = legToStation(se, viaNode, stSnap.s, station.x, station.z);
      for (const point of leg) route.p.push(point[0], point[1]);
      route.length = routeLength(route.p);
      if (!best || route.length < best.route.length) {
        best = { route, fromNode: fromIndex, viaNode };
      }
    }
  }

  // Local case: the car is already on the station's road (or on a road that
  // shares one of its ends), so A* has nothing to search. This is the common
  // case right after arriving at a stop, and previously failed with
  // "You are already at this destination" even though the next stop was 60 m
  // down the same street.
  if (!best) {
    const shared = approaches.filter((node) => node === carEdge.a || node === carEdge.b);
    const sameEdge = snap.edge === seIndex;
    if (sameEdge) {
      // Drive along the road itself. If the marker is behind the car, the
      // route runs backwards and the controller performs a slow turn-around.
      const leg = legToStation(se, se.a, stSnap.s, station.x, station.z);
      const forward = leg.concat();
      const p: number[] = [snap.x, snap.z];
      for (const point of forward) p.push(point[0], point[1]);
      if (p.length >= 4) {
        const route: Route = {
          p,
          edges: [snap.edge],
          length: routeLength(p),
          duration: routeLength(p) / Math.max(1, se.speed),
          fromNode: se.a,
          toNode: se.b,
        };
        best = { route, fromNode: se.a, viaNode: se.a };
      }
    } else if (shared.length) {
      const viaNode = shared[0];
      const node = graph.nodes[viaNode];
      const leg = legToStation(se, viaNode, stSnap.s, station.x, station.z);
      const p: number[] = [snap.x, snap.z, node.x, node.z];
      for (const point of leg) p.push(point[0], point[1]);
      const route: Route = {
        p,
        edges: [snap.edge, seIndex],
        length: routeLength(p),
        duration: routeLength(p) / Math.max(1, Math.min(carEdge.speed, se.speed)),
        fromNode: viaNode,
        toNode: viaNode === se.a ? se.b : se.a,
      };
      best = { route, fromNode: viaNode, viaNode };
    }
  }

  if (!best) {
    return { ok: false, reason: failure, message: failureMessage };
  }

  // A* targets a graph node, not the mid-edge point a station sits on. Keep
  // the shortest approach and drop any overshoot beyond the marker.
  const route = best.route;
  const approach = closestApproach(route.p, station.x, station.z);
  if (approach && approach.distance < 12) {
    route.p = [...approach.p, station.x, station.z];
    route.length = routeLength(route.p);
  }

  // Prepend the car's snapped position so the first pursuit target is on the
  // road the car is actually sitting on.
  if (Math.hypot(route.p[0] - snap.x, route.p[1] - snap.z) > 1.5) {
    route.p = [snap.x, snap.z, ...route.p];
    route.length = routeLength(route.p);
  }
  return { ok: true, route, fromNode: best.fromNode, toNode: best.viaNode };
}

/** Closest point on a route polyline, with the truncated prefix. */
function closestApproach(p: number[], x: number, z: number): { distance: number; p: number[] } | null {
  if (p.length < 4) return null;
  let best = Infinity;
  let bestIndex = -1;
  let bestX = 0;
  let bestZ = 0;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
    const px = x0 + dx * t, pz = z0 + dz * t;
    const d = Math.hypot(px - x, pz - z);
    // Keep the *first* near-tie. The station leg ends by pushing the exact
    // station point, so a later zero-distance duplicate would otherwise make
    // the prefix include the entire overshoot.
    if (d < best - 0.25 || (bestIndex < 0 && d < best)) {
      best = d; bestIndex = i; bestX = px; bestZ = pz;
    }
  }
  if (bestIndex < 0) return null;
  const prefix = p.slice(0, bestIndex);
  prefix.push(bestX, bestZ);
  return { distance: best, p: prefix };
}

/**
 * Polyline from the station's junction node to the station marker, following
 * the station's road edge. Returns null when the station is not on an edge
 * incident to that node (then the route simply ends at the junction).
 */
function stationLeg(graph: RouteGraph, station: StationData): number[][] | null {
  let bestEdge = -1;
  let bestDist = Infinity;
  let fromB = false;
  let bestS = 0;
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    if (e.a !== station.nodeIndex && e.b !== station.nodeIndex) continue;
    const snap = snapToGraph(graph, station.x, station.z, [i]);
    if (snap.distance < bestDist) {
      bestDist = snap.distance;
      bestEdge = i;
      fromB = e.b === station.nodeIndex;
      bestS = snap.s;
    }
  }
  if (bestEdge < 0 || bestDist > 10) return null;
  const e = graph.edges[bestEdge];
  let pts = e.p.slice();
  if (fromB) {
    const rev: number[] = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i], pts[i + 1]);
    pts = rev;
  }
  const target = fromB ? e.len - bestS : bestS;
  const out: number[][] = [];
  let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    acc += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    out.push([pts[i], pts[i + 1]]);
    if (acc >= target) break;
  }
  if (!out.length) return null;
  out.push([station.x, station.z]);
  return out;
}

/** Plan between two arbitrary points (used by tests and the map's "route here"). */
export function planBetween(graph: RouteGraph, from: { x: number; z: number }, to: { x: number; z: number }): PlanResult {
  const a = nearestNode(graph, from.x, from.z);
  const b = nearestNode(graph, to.x, to.z);
  const result = findRoute(graph, a.index, b.index);
  if (!result.ok) {
    return { ok: false, reason: result.reason === 'disconnected' ? 'disconnected' : 'search-limit', message: result.message };
  }
  return { ok: true, route: result.route, fromNode: a.index, toNode: b.index };
}

export type AutoResult = {
  command: { throttle: number; brake: number; steer: number };
  /** Distance along the route, metres. */
  progress: number;
  remaining: number;
  arrived: boolean;
  /** True when the car has been commanded forward but cannot move. */
  stuck: boolean;
};

/**
 * Follow a route. `cursor` is the last known progress in metres; keep it
 * between calls so the controller never snaps backwards at a hairpin.
 */
export function followRoute(
  route: { p: number[] } | number[],
  car: CarState,
  cursor: number,
  stuckSeconds: number
): AutoResult & { cursor: number } {
  const p = Array.isArray(route) ? route : route.p;
  const total = routeLength(p);
  const proj = projectProgress(p, car.x, car.z, cursor);
  const s = Math.max(cursor, proj.s);
  const remaining = Math.max(0, total - s);

  const speedNow = Math.abs(car.speed);
  const lookahead = clamp(6.5 + speedNow * 0.9, 7, 22);
  const target = pointAlong(p, Math.min(total - 0.5, s + lookahead));
  const desiredHeading = Math.atan2(target.x - car.x, target.z - car.z);
  const error = normalizeAngle(desiredHeading - car.yaw);
  const steer = clamp(error * 2.4, -1, 1);

  // Speed target: road limit tapered by curvature ahead. The window grows with
  // speed, because at 20 m/s a 30 m glance is not enough warning for a corner.
  const curveWindow = clamp(16 + speedNow * 2.2, 20, 90);
  const limit = clamp(curveSpeed(p, s, curveWindow, 4.6), 4.5, 22);
  const cruise = Math.min(limit, 17);
  const v = Math.abs(car.speed);

  let throttle = 0;
  let brake = 0;
  if (remaining < 4 && v < 1.2) {
    return {
      command: { throttle: 0, brake: 1, steer: 0 },
      progress: s, remaining, arrived: true, stuck: false, cursor: s,
    };
  }
  if (remaining <= 6) {
    brake = clamp(1 - remaining / 6, 0.25, 1);
    throttle = 0;
  } else if (v > cruise + 1.2) {
    brake = clamp((v - cruise) / 5, 0.1, 1);
  } else if (v < cruise) {
    throttle = clamp((cruise - v) / 4, 0.2, 1);
  } else {
    throttle = 0.15;
  }

  // Sharper steering demands a lower speed.
  if (Math.abs(error) > 0.35 && v > 8) throttle = Math.min(throttle, 0.1);

  const arrived = remaining < 2.5 && v < 0.6;
  return {
    command: { throttle, brake, steer },
    progress: s,
    remaining,
    arrived,
    stuck: stuckSeconds > 3.5,
    cursor: s,
  };
}

/** Total polyline length (metres). */
export function routeLength(p: number[]): number {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  }
  return acc;
}

/**
 * Monotonic projection of a world point onto the route polyline.
 * Searches a window ahead of the cursor so parallel roads never steal the
 * projection, then falls back to a full scan when the car is far off-route.
 */
export function projectProgress(
  p: number[],
  x: number,
  z: number,
  hint: number
): { s: number; distance: number } {
  const total = routeLength(p);
  let bestS = hint;
  let bestD = Infinity;
  let acc = 0;

  const test = (from: number, to: number, base: number) => {
    let a = base;
    for (let i = 2; i < p.length; i += 2) {
      const segLen = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (a + segLen >= from && a <= to) {
        const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
        const dx = x1 - x0, dz = z1 - z0;
        const l2 = dx * dx + dz * dz;
        const t = l2 === 0 ? 0 : clamp(((x - x0) * dx + (z - z0) * dz) / l2, 0, 1);
        const px = x0 + t * dx, pz = z0 + t * dz;
        const d = Math.hypot(px - x, pz - z);
        if (d < bestD) { bestD = d; bestS = a + t * segLen; }
      }
      a += segLen;
    }
    return a;
  };

  acc = test(hint - 12, hint + 45, 0);
  if (bestD > 45) {
    bestS = hint;
    bestD = Infinity;
    test(0, total, 0);
  }
  return { s: clamp(bestS, 0, total), distance: bestD };
}

/**
 * Highest speed that still lets the car take the next `window` metres.
 * `a` is the lateral acceleration budget in m/s².
 */
export function curveSpeed(p: number[], s: number, window: number, a: number): number {
  const total = routeLength(p);
  let heading = 0;
  let travelled = 0;
  let before = pointAlong(p, Math.max(0, s));
  let prev = pointAlong(p, Math.max(0, s));
  for (let d = 5; d <= window + 5; d += 5) {
    const next = pointAlong(p, Math.min(total, s + d));
    const step = Math.hypot(next.x - prev.x, next.z - prev.z);
    if (step < 0.2) break;
    // Bearing between samples, not the sample's own segment heading: the latter
    // is constant along a long straight and hides a corner at the end of it.
    if (travelled > 0) {
      heading += Math.abs(normalizeAngle(
        Math.atan2(next.x - prev.x, next.z - prev.z) - Math.atan2(prev.x - before.x, prev.z - before.z)
      ));
    }
    before = prev;
    prev = next;
    travelled += step;
  }
  if (travelled < 1 || heading < 0.02) return 60;
  const radius = travelled / heading;
  return Math.sqrt(a * radius);
}
