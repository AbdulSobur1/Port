/**
 * Road-network graph built from the extracted drivable OSM ways.
 *
 * Nodes are OSM node ids (they are unique and stable across runs). Edges are
 * polylines between junctions, so route overlays follow the real curvature
 * instead of a chain of straight chords. One-way tags and (where OSM has
 * them) turn restrictions are honoured.
 *
 * Pure TypeScript with no imports: the extraction script runs this in Node,
 * the browser runs the same code for routing, and tests exercise it directly.
 */

export type RoadClass =
  | 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary'
  | 'residential' | 'unclassified' | 'living_street' | 'service' | 'road';

export type RoadInput = {
  /** OSM way id (split boundary runs share the id). */
  id: number;
  cls: string;
  name: string | null;
  width: number;
  oneway: -1 | 0 | 1;
  drivable: boolean;
  /** Speed limit in m/s used for routing cost and autopilot. */
  speed: number;
  /** OSM node ids, parallel to `pts`. */
  refs: number[];
  /** World-space polyline: [x,z,x,z,…] in metres. */
  pts: number[];
};

export type GraphNode = { id: number; x: number; z: number };

export type GraphEdge = {
  /** Index of the from/to node in `nodes`. */
  a: number;
  b: number;
  /** World polyline including both endpoints: [x,z,…]. */
  p: number[];
  /** Length in metres. */
  len: number;
  cls: string;
  name: string | null;
  /** Speed used for cost/autopilot, m/s. */
  speed: number;
  /** OSM way id this edge came from. */
  way: number;
  /** True when the edge may only be traversed a→b. */
  oneway: boolean;
};

export type GraphPayloadLike = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  banned: number[][];
  stats: RouteGraph['stats'];
};

/** Rebuild the runtime graph (Map + adjacency) from the shipped JSON payload. */
export function hydrateGraph(payload: GraphPayloadLike): RouteGraph {
  const index = new Map<number, number>();
  payload.nodes.forEach((n, i) => index.set(n.id, i));
  const out: number[][] = payload.nodes.map(() => []);
  payload.edges.forEach((e, i) => {
    out[e.a].push(i);
    if (!e.oneway) out[e.b].push(i);
  });
  return { nodes: payload.nodes, edges: payload.edges, out, banned: payload.banned, index, stats: payload.stats };
}

export type RouteGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Adjacency: for each node index, outgoing edge indices. */
  out: number[][];
  /** Banned turn triples (fromNode, viaNode, toNode) from OSM restrictions. */
  banned: number[][];
  /** Node index lookup by OSM id. */
  index: Map<number, number>;
  stats: {
    junctionCount: number;
    edgeCount: number;
    /** Node counts of the weakly connected components, largest first. */
    components: number[];
    /** Index of the largest component's representative node. */
    mainComponent: number;
    droppedShortEdges: number;
    /** Why some OSM turn restrictions could not be applied. */
    turnRestrictions?: {
      received: number;
      applied: number;
      viaNotInGraph: number;
      wayNotInGraph: number;
      noLegalPair: number;
    };
  };
};

export type TurnRestriction = { from: number; to: number; via: number; kind: string };

/**
 * Build the graph from drivable roads.
 *
 * `turnRestrictions` come straight from OSM (way ids + via node id); they are
 * resolved to node triples here, and restrictions whose ways are not part of
 * the drivable graph are dropped (and counted by the caller via `stats`).
 */
export function buildRouteGraph(
  roads: RoadInput[],
  turnRestrictions: TurnRestriction[] = []
): RouteGraph {
  const drivable = roads.filter((r) => r.drivable && r.refs.length >= 2 && r.pts.length >= 4);

  // --- 1. junction detection --------------------------------------------
  const useCount = new Map<number, number>();
  for (const road of drivable) {
    for (const ref of road.refs) useCount.set(ref, (useCount.get(ref) ?? 0) + 1);
  }
  const isJunction = (ref: number, pos: number, last: number) =>
    pos === 0 || pos === last || (useCount.get(ref) ?? 0) > 1;

  // --- 2. split ways into junction-to-junction edges ---------------------
  const nodes: GraphNode[] = [];
  const index = new Map<number, number>();
  const nodeFor = (ref: number, x: number, z: number) => {
    let i = index.get(ref);
    if (i === undefined) {
      i = nodes.length;
      index.set(ref, i);
      nodes.push({ id: ref, x, z });
    }
    return i;
  };

  const edges: GraphEdge[] = [];
  const wayEdges = new Map<number, number[]>();
  let droppedShortEdges = 0;

  for (const road of drivable) {
    const last = road.refs.length - 1;
    let startPos = 0;
    for (let i = 1; i <= last; i++) {
      if (!isJunction(road.refs[i], i, last)) continue;
      const sliceRefs = road.refs.slice(startPos, i + 1);
      const pts: number[] = [];
      for (let k = startPos; k <= i; k++) pts.push(road.pts[2 * k], road.pts[2 * k + 1]);
      startPos = i;
      let len = 0;
      for (let k = 2; k < pts.length; k += 2) {
        len += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      }
      // Validate *before* creating nodes: dropping an edge afterwards would
      // leave orphan nodes and inflate the component count.
      if (len < 0.75 || (sliceRefs[0] === sliceRefs[sliceRefs.length - 1])) {
        droppedShortEdges++;
        continue;
      }
      const a = nodeFor(sliceRefs[0], pts[0], pts[1]);
      const b = nodeFor(sliceRefs[sliceRefs.length - 1], pts[pts.length - 2], pts[pts.length - 1]);
      if (a === b) { droppedShortEdges++; continue; }
      const edge: GraphEdge = {
        a, b, p: pts, len,
        cls: road.cls,
        name: road.name,
        speed: road.speed,
        way: road.id,
        oneway: road.oneway === 1 || road.oneway === -1,
      };
      // A `oneway=-1` way is reversed: swap endpoints and keep the geometry
      // in travel direction so route drawing is always "forward".
      if (road.oneway === -1) {
        edge.a = b;
        edge.b = a;
        edge.p = reverseFlat(pts);
      }
      const ei = edges.length;
      edges.push(edge);
      const list = wayEdges.get(road.id);
      if (list) list.push(ei); else wayEdges.set(road.id, [ei]);
    }
  }

  // --- 3. adjacency -----------------------------------------------------
  const out: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    out[e.a].push(i);
    if (!e.oneway) out[e.b].push(i);
  });

  // --- 4. turn restrictions --------------------------------------------
  const banned: number[][] = [];
  const seen = new Set<string>();
  const turnDiag = { received: turnRestrictions.length, applied: 0, viaNotInGraph: 0, wayNotInGraph: 0, noLegalPair: 0 };
  for (const r of turnRestrictions) {
    const via = index.get(r.via);
    if (via === undefined) { turnDiag.viaNotInGraph++; continue; }
    if (!wayEdges.has(r.from) || !wayEdges.has(r.to)) { turnDiag.wayNotInGraph++; continue; }
    const fromEdges = (wayEdges.get(r.from) ?? []).filter((i) => edges[i].a === via || edges[i].b === via);
    const toEdges = (wayEdges.get(r.to) ?? []).filter((i) => edges[i].a === via || edges[i].b === via);
    let before = banned.length;
    for (const fi of fromEdges) {
      // Legal entry: a two-way edge either way, a one-way edge only a→b.
      if (edges[fi].oneway && edges[fi].b !== via) continue;
      const fromNode = edges[fi].a === via ? edges[fi].b : edges[fi].a;
      for (const ti of toEdges) {
        // Legal exit: leave the via node in the edge's travel direction.
        if (edges[ti].oneway && edges[ti].a !== via) continue;
        if (!edges[ti].oneway && edges[ti].a !== via && edges[ti].b !== via) continue;
        const toNode = edges[ti].a === via ? edges[ti].b : edges[ti].a;
        if (fromNode === toNode) continue;
        const key = `${fromNode}|${via}|${toNode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        banned.push([fromNode, via, toNode]);
      }
    }
    if (banned.length > before) turnDiag.applied++;
    else turnDiag.noLegalPair++;
  }

  // --- 5. connectivity --------------------------------------------------
  const components = weaklyConnectedComponents(nodes.length, edges).sort((a, b) => b - a);
  const junctionCount = nodes.filter((_, i) => out[i].length > 1).length;

  const graph: RouteGraph = {
    nodes, edges, out, banned, index,
    stats: {
      junctionCount,
      edgeCount: edges.length,
      components,
      mainComponent: -1,
      droppedShortEdges,
      turnRestrictions: turnDiag,
    },
  };
  graph.stats.mainComponent = nodes.length ? mainComponentNode(graph) : -1;
  return graph;
}

function reverseFlat(p: number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

/** Component sizes via union-find over the undirected skeleton. */
export function weaklyConnectedComponents(nodeCount: number, edges: { a: number; b: number }[]): number[] {
  const parent = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
    return r;
  };
  for (const e of edges) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent[ra] = rb;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  return [...sizes.values()];
}

/** Node index of the node belonging to the largest component (for spawn). */
export function mainComponentNode(graph: RouteGraph): number {
  const parent = new Int32Array(graph.nodes.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
    return r;
  };
  for (const e of graph.edges) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent[ra] = rb;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < graph.nodes.length; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let bestRoot = -1, bestSize = -1;
  for (const [root, size] of sizes) if (size > bestSize) { bestSize = size; bestRoot = root; }
  for (let i = 0; i < graph.nodes.length; i++) if (find(i) === bestRoot) return i;
  return 0;
}

/** Nearest graph node index to a world point (linear scan; node counts are ~1e4). */
export function nearestNode(graph: RouteGraph, x: number, z: number): { index: number; distance: number } {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: Math.sqrt(bestD) };
}

export type SnapResult = {
  edge: number;
  /** Position along the edge polyline, metres. */
  s: number;
  x: number;
  z: number;
  /** Distance from the query point to the polyline, metres. */
  distance: number;
  /** Travel heading at the snap point (radians, 0 = +Z / north). */
  heading: number;
};

/**
 * Closest point on any edge polyline. Used to place the vehicle on a road and
 * to attach project stations to the network.
 */
export function snapToGraph(graph: RouteGraph, x: number, z: number, candidates?: number[]): SnapResult {
  let best: SnapResult | null = null;
  const check = (ei: number) => {
    const e = graph.edges[ei];
    let acc = 0;
    for (let i = 2; i < e.p.length; i += 2) {
      const x0 = e.p[i - 2], z0 = e.p[i - 1];
      const x1 = e.p[i], z1 = e.p[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const segLen2 = dx * dx + dz * dz;
      const t = segLen2 === 0 ? 0 : clamp(((x - x0) * dx + (z - z0) * dz) / segLen2, 0, 1);
      const px = x0 + t * dx, pz = z0 + t * dz;
      const d = Math.hypot(px - x, pz - z);
      if (!best || d < best.distance) {
        best = {
          edge: ei,
          s: acc + t * Math.sqrt(segLen2),
          x: px,
          z: pz,
          distance: d,
          heading: Math.atan2(dx, dz),
        };
      }
      acc += Math.sqrt(segLen2);
    }
  };
  if (candidates) candidates.forEach(check);
  else for (let i = 0; i < graph.edges.length; i++) check(i);
  if (!best) throw new Error('snapToGraph: graph has no edges');
  return best;
}

/** Point at distance `s` along a polyline. */
export function pointAlong(p: number[], s: number): { x: number; z: number; heading: number } {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1];
    const x1 = p[i], z1 = p[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (acc + seg >= s || i === p.length - 2) {
      const t = seg === 0 ? 0 : clamp((s - acc) / seg, 0, 1);
      return { x: x0 + t * (x1 - x0), z: z0 + t * (z1 - z0), heading: Math.atan2(x1 - x0, z1 - z0) };
    }
    acc += seg;
  }
  return { x: p[0], z: p[1], heading: 0 };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

export type Route = {
  /** Flat polyline of the whole route, [x,z,…], in travel order. */
  p: number[];
  /** Edge indices traversed, in order. */
  edges: number[];
  length: number;
  /** Estimated driving time, seconds. */
  duration: number;
  fromNode: number;
  toNode: number;
};

export type RouteFailure = {
  ok: false;
  reason: 'no-graph' | 'disconnected' | 'same-node' | 'unescaped-area';
  message: string;
  fromNode?: number;
  toNode?: number;
};

export type RouteResult = { ok: true; route: Route } | RouteFailure;

/** Binary min-heap keyed by f-score. */
class Heap {
  private items: number[] = [];
  private scores: number[] = [];
  push(item: number, score: number) {
    let i = this.items.length;
    this.items.push(item);
    this.scores.push(score);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastScore = this.scores.pop() as number;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.scores[l] < this.scores[m]) m = l;
        if (r < this.items.length && this.scores[r] < this.scores[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
  private swap(i: number, j: number) {
    const ti = this.items[i]; this.items[i] = this.items[j]; this.items[j] = ti;
    const ts = this.scores[i]; this.scores[i] = this.scores[j]; this.scores[j] = ts;
  }
}

/**
 * A* over the road graph.
 *
 * Cost is travel time (len / speed) with a small penalty for turns, so the
 * route prefers a direct road over zig-zagging through side streets. The
 * heuristic is straight-line distance divided by the fastest speed present,
 * which is admissible.
 */
export function findRoute(
  graph: RouteGraph,
  fromNode: number,
  toNode: number,
  options: { maxExpand?: number } = {}
): RouteResult {
  if (!graph.edges.length || !graph.nodes.length) {
    return { ok: false, reason: 'no-graph', message: 'The road graph is empty.' };
  }
  if (fromNode === toNode) {
    return { ok: false, reason: 'same-node', message: 'You are already at this destination.' };
  }
  if (fromNode < 0 || toNode < 0 || fromNode >= graph.nodes.length || toNode >= graph.nodes.length) {
    return { ok: false, reason: 'no-graph', message: 'Unknown route endpoints.' };
  }

  let fastest = 1;
  for (const e of graph.edges) if (e.speed > fastest) fastest = e.speed;

  const n = graph.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevNode = new Int32Array(n).fill(-1);
  const bannedSet = new Set(graph.banned.map(([a, b, c]) => `${a}|${b}|${c}`));

  const target = graph.nodes[toNode];
  const h = (i: number) => {
    const node = graph.nodes[i];
    return Math.hypot(node.x - target.x, node.z - target.z) / fastest;
  };

  gScore[fromNode] = 0;
  const heap = new Heap();
  heap.push(fromNode, h(fromNode));
  const closed = new Uint8Array(n);
  const maxExpand = options.maxExpand ?? 400_000;
  let expanded = 0;
  let found = false;

  while (heap.size && expanded < maxExpand) {
    const current = heap.pop() as number;
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;
    if (current === toNode) { found = true; break; }
    for (const ei of graph.out[current]) {
      const e = graph.edges[ei];
      const next = e.a === current ? e.b : e.a;
      if (closed[next]) continue;
      if (prevNode[current] >= 0 && bannedSet.has(`${prevNode[current]}|${current}|${next}`)) continue;
      const turnPenalty = turnCost(graph, prevEdge[current], ei, current);
      const cost = gScore[current] + e.len / e.speed + turnPenalty;
      if (cost < gScore[next]) {
        gScore[next] = cost;
        prevEdge[next] = ei;
        prevNode[next] = current;
        heap.push(next, cost + h(next));
      }
    }
  }

  if (!found) {
    // Distinguish "no legal direction of travel" from "A* gave up": a one-way
    // pair can be weakly connected yet impossible to drive.
    const reachable = reachableNodes(graph, fromNode, toNode);
    return {
      ok: false,
      reason: reachable ? 'unescaped-area' : 'disconnected',
      message: reachable
        ? 'No connected road route was found to this destination within the search limit.'
        : 'No legal driving route connects these roads — usually a one-way direction, a closed estate gate, or a missing crossing.',
      fromNode,
      toNode,
    };
  }

  // --- reconstruct ------------------------------------------------------
  const edgeChain: number[] = [];
  let cursor = toNode;
  while (cursor !== fromNode) {
    const ei = prevEdge[cursor];
    if (ei < 0) break;
    edgeChain.push(ei);
    cursor = prevNode[cursor];
  }
  edgeChain.reverse();

  const p: number[] = [];
  let length = 0;
  let duration = 0;
  for (const ei of edgeChain) {
    const e = graph.edges[ei];
    let pts = e.p;
    // Edge is stored in travel direction for one-ways; two-way edges may be
    // traversed either way, so orient the geometry to the walk direction.
    if (e.a !== cursor) pts = reverseFlat(pts);
    const start = p.length ? 2 : 0;
    for (let i = start; i < pts.length; i++) p.push(pts[i]);
    length += e.len;
    duration += e.len / e.speed;
    cursor = e.a === cursor ? e.b : e.a;
  }

  return {
    ok: true,
    route: { p, edges: edgeChain, length, duration, fromNode, toNode },
  };
}

/** Directed reachability (honours one-way edges), used to explain routing failures. */
export function reachableNodes(graph: RouteGraph, a: number, b: number): boolean {
  const seen = new Uint8Array(graph.nodes.length);
  const queue = [a];
  seen[a] = 1;
  while (queue.length) {
    const at = queue.pop() as number;
    if (at === b) return true;
    for (const ei of graph.out[at]) {
      const e = graph.edges[ei];
      const next = e.a === at ? e.b : e.a;
      if (!seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  return false;
}

/** Weak connectivity helper kept for callers that only need the skeleton. */
export function sameComponent(graph: RouteGraph, a: number, b: number): boolean {
  const adj: number[][] = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const seen = new Uint8Array(graph.nodes.length);
  const queue = [a];
  seen[a] = 1;
  while (queue.length) {
    const at = queue.pop() as number;
    if (at === b) return true;
    for (const next of adj[at]) {
      if (!seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  return false;
}

/** Turn cost: prefer going straight, punish sharp turns (seconds). */
function turnCost(graph: RouteGraph, prevEdgeIdx: number, nextEdgeIdx: number, at: number): number {
  if (prevEdgeIdx < 0) return 0;
  const prev = graph.edges[prevEdgeIdx];
  const next = graph.edges[nextEdgeIdx];
  const prevPts = prev.a === at ? prev.p : reverseFlat(prev.p);
  const nextPts = next.a === at ? next.p : reverseFlat(next.p);
  const L = prevPts.length;
  const hPrev = Math.atan2(prevPts[L - 2] - prevPts[L - 4], prevPts[L - 1] - prevPts[L - 3]);
  const hNext = Math.atan2(nextPts[2] - nextPts[0], nextPts[3] - nextPts[1]);
  let d = Math.abs(normalizeAngle(hNext - hPrev));
  if (d > Math.PI / 2) d = Math.PI - d; // left vs right turn cost the same
  return d > 0.35 ? 1.5 + (d - 0.35) * 1.2 : 0;
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
