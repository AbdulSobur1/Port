/** Geometry helpers: simplification, quantization, polygon area. Flat [x,z,x,z...] arrays. */

/** Ramer–Douglas–Peucker. Epsilon in the same units as the points. */
export function rdpFlat(pts, epsilon) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const e2 = epsilon * epsilon;
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1;
    let idx = -1;
    const ax = pts[2 * a], az = pts[2 * a + 1];
    const dx = pts[2 * b] - ax, dz = pts[2 * b + 1] - az;
    const len2 = dx * dx + dz * dz;
    for (let i = a + 1; i < b; i++) {
      const px = pts[2 * i] - ax, pz = pts[2 * i + 1] - az;
      let t = len2 === 0 ? 0 : (px * dx + pz * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ez = pz - t * dz;
      const d = ex * ex + ez * ez;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > e2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

/** Signed area (x,z plane). Positive = counter-clockwise. */
export function ringArea(pts) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += pts[2 * j] * pts[2 * i + 1] - pts[2 * i] * pts[2 * j + 1];
  }
  return a / 2;
}

/** Drop consecutive duplicate/near-duplicate points. */
export function dedupeFlat(pts, minDist) {
  const d2 = minDist * minDist;
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = out.length;
    if (n >= 2) {
      const dx = pts[i] - out[n - 2], dz = pts[i + 1] - out[n - 1];
      if (dx * dx + dz * dz < d2) continue;
    }
    out.push(pts[i], pts[i + 1]);
  }
  return out;
}

/** Round each coordinate to 0.1 (decimetre) precision. */
export function quantizeFlat(pts) {
  return pts.map((v) => Math.round(v * 10) / 10);
}
