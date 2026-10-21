/**
 * Building collision derived from the *same* footprint arrays used for the
 * render meshes: each footprint is reduced to its minimum oriented bounding
 * box (longest edge defines the axis) and inserted into a uniform grid.
 *
 * That is deliberately cheaper than a polygon collision mesh: the render mesh
 * can stay detailed while physics stays a few thousand static boxes. Vehicles
 * are approximated by two circles, and each circle is pushed out of the box
 * along the shallowest axis — the standard, stable OBB-vs-circle resolution.
 */

export type Collider = {
  cx: number;
  cz: number;
  /** Unit axis of the box (long side), and its perpendicular. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Half extents along a and b. */
  ha: number;
  hb: number;
};

export type CollisionGrid = {
  cell: number;
  buckets: Map<string, Collider[]>;
  count: number;
};

const CELL = 48;

/** Oriented bounding box of a footprint (flat [x,z,…]). */
export function footprintCollider(p: number[]): Collider | null {
  const n = p.length / 2;
  if (n < 3) return null;
  // Longest edge gives a stable axis for the extremely common rectilinear
  // Lagos footprint; it stays axis-aligned for the L-shaped minority.
  let bestLen = -1;
  let ax = 1, az = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = p[2 * j] - p[2 * i];
    const dz = p[2 * j + 1] - p[2 * i + 1];
    const len = dx * dx + dz * dz;
    if (len > bestLen) { bestLen = len; ax = dx; az = dz; }
  }
  const len = Math.sqrt(bestLen);
  if (len < 0.5) return null;
  ax /= len; az /= len;
  const bx = -az, bz = ax;

  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const a = p[i] * ax + p[i + 1] * az;
    const b = p[i] * bx + p[i + 1] * bz;
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  const cx = ax * ((minA + maxA) / 2) + bx * ((minB + maxB) / 2);
  const cz = az * ((minA + maxA) / 2) + bz * ((minB + maxB) / 2);
  return {
    cx, cz, ax, az, bx, bz,
    ha: Math.max(0.35, (maxA - minA) / 2),
    hb: Math.max(0.35, (maxB - minB) / 2),
  };
}

export function createCollisionGrid(footprints: number[][]): CollisionGrid {
  const buckets = new Map<string, Collider[]>();
  let count = 0;
  const add = (c: Collider) => {
    const r = Math.hypot(c.ha, c.hb);
    const minX = c.cx - r, maxX = c.cx + r, minZ = c.cz - r, maxZ = c.cz + r;
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const key = `${gx},${gz}`;
        const list = buckets.get(key);
        if (list) list.push(c); else buckets.set(key, [c]);
      }
    }
    count++;
  };
  for (const p of footprints) {
    const c = footprintCollider(p);
    if (c) add(c);
  }
  return { cell: CELL, buckets, count };
}

export type PushOut = { hit: boolean; nx: number; nz: number; depth: number };

/**
 * Push a circle out of every building box it overlaps.
 * Returns the accumulated correction plus the normal of the deepest overlap.
 */
export function resolveCircle(grid: CollisionGrid, x: number, z: number, radius: number): PushOut {
  const gx = Math.floor(x / grid.cell);
  const gz = Math.floor(z / grid.cell);
  let px = 0, pz = 0;
  let hit = false;
  let bestDepth = 0;
  let nx = 0, nz = 0;

  const consider = (c: Collider) => {
    const dx = x - c.cx;
    const dz = z - c.cz;
    // Cheap reject: bounding radius.
    if (Math.hypot(dx, dz) > Math.hypot(c.ha, c.hb) + radius) return;
    const la = dx * c.ax + dz * c.az;
    const lb = dx * c.bx + dz * c.bz;
    const ca = Math.max(-c.ha, Math.min(c.ha, la));
    const cb = Math.max(-c.hb, Math.min(c.hb, lb));
    const closeA = la - ca;
    const closeB = lb - cb;
    const dist = Math.hypot(closeA, closeB);

    if (dist > 1e-6) {
      if (dist >= radius) return;
      const depth = radius - dist;
      const ux = (c.ax * closeA + c.bx * closeB) / dist;
      const uz = (c.az * closeA + c.bz * closeB) / dist;
      px += ux * depth;
      pz += uz * depth;
      hit = true;
      if (depth > bestDepth) { bestDepth = depth; nx = ux; nz = uz; }
      return;
    }

    // Centre is inside the box: exit along the shallowest face.
    const dA = c.ha - Math.abs(la);
    const dB = c.hb - Math.abs(lb);
    let ux: number, uz: number, depth: number;
    if (dA < dB) {
      const sign = la >= 0 ? 1 : -1;
      ux = c.ax * sign; uz = c.az * sign; depth = dA + radius;
    } else {
      const sign = lb >= 0 ? 1 : -1;
      ux = c.bx * sign; uz = c.bz * sign; depth = dB + radius;
    }
    px += ux * depth;
    pz += uz * depth;
    hit = true;
    if (depth > bestDepth) { bestDepth = depth; nx = ux; nz = uz; }
  };

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const list = grid.buckets.get(`${gx + ox},${gz + oz}`);
      if (list) for (const c of list) consider(c);
    }
  }

  return { hit, nx, nz, depth: bestDepth };
}

/** Clamp a point into the drivable world box (a hard boundary, not a wall mesh). */
export function clampToWorld(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  x: number,
  z: number,
  margin = 12
): { x: number; z: number; hit: boolean } {
  const cx = Math.min(bounds.maxX - margin, Math.max(bounds.minX + margin, x));
  const cz = Math.min(bounds.maxZ - margin, Math.max(bounds.minZ + margin, z));
  return { x: cx, z: cz, hit: cx !== x || cz !== z };
}
