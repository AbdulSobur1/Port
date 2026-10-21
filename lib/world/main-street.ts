/**
 * One authoritative main street for the playable neighbourhood.
 *
 * The brief requires every portfolio stop on a single continuous street. OSM
 * gives us a dual-carriageway named *Adeniji Adele Road*: two one-way chains
 * that run east–west across the playable core. This module finds the longest
 * connected chain of edges carrying that name, keeps only the part inside the
 * playable rectangle, and returns:
 *
 *   - the street centreline (the same polyline the map, the 3D road ribbon and
 *     the collision graph use), and
 *   - evenly spaced station anchors with a travel heading and a street address.
 *
 * It is deliberately dependency-free and pure: the extraction script runs it in
 * Node, the validation script re-runs it against the shipped payload, and the
 * browser can use the stored `meta.mainStreet` without recomputing anything. If
 * the two ever disagree, validation fails.
 */

export type StreetEdgeInput = {
  a: number;
  b: number;
  p: number[];
  len: number;
  name: string | null;
};

export type StreetChain = {
  /** Indices into the graph edge array, in travel order. */
  edgeIds: number[];
  /** Centreline [x,z,…] in travel order. */
  p: number[];
  /** Chain length in metres. */
  length: number;
};

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export type StreetAnchor = {
  /** Chain index of the station stop. */
  index: number;
  /** Distance along the chain, metres. */
  s: number;
  x: number;
  z: number;
  /** Travel heading at the stop (radians, 0 = +Z). */
  heading: number;
};

const EPS = 1e-6;

/** Flat polyline length. */
export function flatLength(p: number[]): number {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  }
  return acc;
}

/** Point and heading at distance `s` along a flat polyline. */
export function pointAt(p: number[], s: number): { x: number; z: number; heading: number } {
  const total = flatLength(p);
  const clamped = Math.max(0, Math.min(total, s));
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (acc + seg >= clamped || i === p.length - 2) {
      const t = seg <= EPS ? 0 : Math.max(0, Math.min(1, (clamped - acc) / seg));
      return {
        x: x0 + (x1 - x0) * t,
        z: z0 + (z1 - z0) * t,
        heading: Math.atan2(x1 - x0, z1 - z0),
      };
    }
    acc += seg;
  }
  return { x: p[0] ?? 0, z: p[1] ?? 0, heading: 0 };
}

/** Distance from a point to a flat polyline (metres). */
export function distanceToPolyline(p: number[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], x1 = p[i], z1 = p[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = l2 <= EPS ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
    best = Math.min(best, Math.hypot(x0 + dx * t - x, z0 + dz * t - z));
  }
  return best;
}

/** Reverse a flat [x,z,…] polyline. */
export function reverseFlat(p: number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

function inside(box: Box, x: number, z: number, pad = 0): boolean {
  return x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
}

/** Fraction of a polyline's vertices inside the playable box. */
function insideFraction(p: number[], box: Box): number {
  const n = p.length / 2;
  if (!n) return 0;
  let insideCount = 0;
  for (let i = 0; i < p.length; i += 2) if (inside(box, p[i], p[i + 1])) insideCount++;
  return insideCount / n;
}

/** Trim a polyline to the first and last vertices inside the box. */
function clipToBox(p: number[], box: Box): number[] | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < p.length; i += 2) {
    if (!inside(box, p[i], p[i + 1])) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0 || last <= first) return null;
  return p.slice(first, last + 2);
}

/**
 * Longest connected run of edges carrying `name`, trimmed to `box`.
 *
 * Edges are chained through shared graph nodes. A dual carriageway yields two
 * chains; both are candidates, and the longer one wins (a stable tie-break on
 * the westernmost vertex keeps the result deterministic).
 */
export function longestStreetChain(
  edges: StreetEdgeInput[],
  name: string,
  box: Box
): StreetChain | null {
  const candidates: number[] = [];
  for (let i = 0; i < edges.length; i++) if (edges[i].name === name) candidates.push(i);
  if (!candidates.length) return null;

  // Node → incident candidate edges.
  const incident = new Map<number, number[]>();
  for (const ei of candidates) {
    const e = edges[ei];
    for (const node of [e.a, e.b]) {
      const list = incident.get(node);
      if (list) list.push(ei); else incident.set(node, [ei]);
    }
  }

  const visited = new Set<number>();
  const chains: number[][] = [];

  const walk = (startEdge: number, startNode: number): number[] => {
    const chain: number[] = [];
    let edgeId: number | null = startEdge;
    let at = startNode;
    while (edgeId !== null) {
      visited.add(edgeId);
      chain.push(edgeId);
      const e = edges[edgeId];
      const next = e.a === at ? e.b : e.a;
      at = next;
      let found: number | null = null;
      for (const other of incident.get(at) ?? []) {
        if (visited.has(other)) continue;
        const oe = edges[other];
        // Only continue through a node of degree two in this subgraph; a
        // junction means the named street ends here (another street crosses).
        if (oe.a !== at && oe.b !== at) continue;
        found = other;
        break;
      }
      edgeId = found;
    }
    return chain;
  };

  // Start at chain ends (degree 1 in the named subgraph), then sweep any loops.
  for (const ei of candidates) {
    const e = edges[ei];
    if (visited.has(ei)) continue;
    const da = (incident.get(e.a) ?? []).length;
    const db = (incident.get(e.b) ?? []).length;
    if (da === 1) chains.push(walk(ei, e.a));
    else if (db === 1) chains.push(walk(ei, e.b));
  }
  for (const ei of candidates) {
    if (visited.has(ei)) continue;
    const e = edges[ei];
    chains.push(walk(ei, e.a));
  }

  let best: { p: number[]; length: number; edgeIds: number[] } | null = null;
  for (const chain of chains) {
    const p = chainPolyline(edges, chain);
    if (p.length < 4) continue;
    const clipped = clipToBox(p, box);
    if (!clipped || clipped.length < 4) continue;
    // Ignore a run that only clips a corner of the playable area; the main
    // street has to be a street the player can actually drive along.
    if (insideFraction(clipped, box) < 0.99) continue;
    const length = flatLength(clipped);
    if (length < 120) continue;
    if (
      !best ||
      length > best.length + 0.5 ||
      (Math.abs(length - best.length) <= 0.5 && clipped[0] < best.p[0])
    ) {
      best = { p: clipped, length, edgeIds: chain };
    }
  }
  return best;
}

/** Build one oriented polyline for an ordered list of connected edges. */
export function chainPolyline(edges: StreetEdgeInput[], chain: number[]): number[] {
  const out: number[] = [];
  let at: number | null = null;
  for (const ei of chain) {
    const e = edges[ei];
    let pts = e.p;
    if (at !== null) {
      if (e.a === at) {
        // already oriented
      } else if (e.b === at) {
        pts = reverseFlat(pts);
      } else {
        // Disconnected chain: keep the geometry but stop pretending it joins.
        break;
      }
    }
    for (let i = out.length ? 2 : 0; i < pts.length; i++) out.push(pts[i]);
    at = pts[0] === e.p[0] && pts[1] === e.p[1] ? e.b : e.a;
  }
  return out;
}

/**
 * Evenly spaced stops along a chain.
 *
 * `margin` is a fraction of the chain length left at each end so the arrival
 * point and the last stop are not jammed against a junction. Returns anchors in
 * travel order.
 */
export function placeStationsAlong(
  chain: StreetChain,
  count: number,
  margin = 0.06
): StreetAnchor[] {
  if (count <= 0) return [];
  const usable = Math.max(0, chain.length * (1 - margin * 2));
  const out: StreetAnchor[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const s = chain.length * margin + usable * t;
    const point = pointAt(chain.p, s);
    out.push({
      index: i,
      s,
      x: Math.round(point.x * 10) / 10,
      z: Math.round(point.z * 10) / 10,
      heading: Math.round(point.heading * 1000) / 1000,
    });
  }
  return out;
}

/** `12 Adeniji Adele Road` style address, deterministic from the stop index. */
export function streetAddress(name: string, index: number): string {
  return `${index * 2 + 1} ${name}`;
}
