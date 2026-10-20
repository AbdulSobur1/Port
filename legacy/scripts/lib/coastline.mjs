/**
 * Chain natural=coastline ways into closed sea rings.
 * OSM convention: water lies LEFT of the way direction; chains are only
 * extended head-to-tail (never reversed). Loose ends close along the
 * shorter bounds-boundary walk (documented approximation).
 */
import { ringArea } from './geometry-utils.mjs';

const key = (lng, lat) => `${Math.round(lng * 1e7)},${Math.round(lat * 1e7)}`;

export function chainCoastlines(ways, bounds) {
  const byStart = new Map();
  ways.forEach((w, i) => {
    const k = key(w.p[0], w.p[1]);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(i);
  });
  const used = new Array(ways.length).fill(false);
  const chains = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = ways[i].p.slice();
    // extend forward
    for (;;) {
      const endK = key(pts[pts.length - 2], pts[pts.length - 1]);
      const cands = byStart.get(endK) || [];
      const next = cands.find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      pts = pts.concat(ways[next].p.slice(2));
    }
    chains.push(pts);
  }
  const rings = [];
  let closed = 0, boundaryClosures = 0, dropped = 0;
  for (const pts of chains) {
    const closedRing = key(pts[0], pts[1]) === key(pts[pts.length - 2], pts[pts.length - 1]);
    if (closedRing) { rings.push(pts.slice(0, -2)); closed++; continue; }
    const onEdge = ([lng, lat]) =>
      lng <= bounds.west + 1e-6 || lng >= bounds.east - 1e-6 ||
      lat <= bounds.south + 1e-6 || lat >= bounds.north - 1e-6;
    if (!onEdge([pts[0], pts[1]]) || !onEdge([pts[pts.length - 2], pts[pts.length - 1]])) {
      dropped++; continue; // interior loose end: unreliable ring
    }
    rings.push(closeAlongBoundary(pts, bounds));
    boundaryClosures++;
  }
  return { rings, closed, boundaryClosures, dropped };
}

/** Walk the bounds boundary from chain end back to chain start (shorter way). */
function closeAlongBoundary(pts, bounds) {
  const perimeter = [];
  const steps = 400;
  const corners = [
    [bounds.west, bounds.south], [bounds.east, bounds.south],
    [bounds.east, bounds.north], [bounds.west, bounds.north],
  ];
  for (let c = 0; c < 4; c++) {
    const [x0, z0] = corners[c];
    const [x1, z1] = corners[(c + 1) % 4];
    for (let s = 0; s < steps; s++) {
      perimeter.push([x0 + (x1 - x0) * (s / steps), z0 + (z1 - z0) * (s / steps)]);
    }
  }
  const project = ([lng, lat]) => {
    // index of closest perimeter point, and distance along perimeter
    let best = 0, bestD = Infinity, acc = 0, bestAcc = 0;
    for (let i = 0; i < perimeter.length; i++) {
      const p = perimeter[i];
      const nx = i === perimeter.length - 1 ? perimeter[0][0] : perimeter[i + 1][0];
      const nz = i === perimeter.length - 1 ? perimeter[0][1] : perimeter[i + 1][1];
      acc += Math.hypot(nx - p[0], nz - p[1]);
      const d = (lng - p[0]) ** 2 + (lat - p[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; bestAcc = acc; }
    }
    return { idx: best, dist: bestAcc };
  };
  const start = project([pts[0], pts[1]]);
  const end = project([pts[pts.length - 2], pts[pts.length - 1]]);
  const forward = (end.idx - start.idx + perimeter.length) % perimeter.length;
  const backward = perimeter.length - forward;
  const step = forward <= backward ? 1 : -1;
  const out = pts.slice();
  let i = end.idx;
  for (;;) {
    out.push(perimeter[i][0], perimeter[i][1]);
    if (i === start.idx) break;
    i = (i + step + perimeter.length) % perimeter.length;
  }
  return out;
}

/** Largest-area ring wins when a chain produced several candidates. */
export function seaPolygon(rings) {
  if (!rings.length) return null;
  let best = null, bestA = -Infinity;
  for (const r of rings) {
    const a = Math.abs(ringArea(r));
    if (a > bestA) { bestA = a; best = r; }
  }
  return best;
}
