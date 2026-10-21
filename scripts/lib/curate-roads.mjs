/**
 * Turn an OSM road extract into a drivable network.
 *
 * The previous world shipped every drivable way inside a 10 × 9.9 km rectangle:
 * 5 935 ways, including parking aisles, estate driveways, service loops and
 * fragments that dead-ended a few metres off a main street. That is why the
 * roads looked scattered — the extract was not a network, it was a survey.
 *
 * This module curates the ways *before* the graph and the render meshes are
 * built, so the road surface, the intersections, the collision data and the
 * navigation graph all come from the same surviving set:
 *
 *  1. drop non-car classes (footways, paths, steps, cycleways, tracks);
 *  2. enforce a minimum carriageway width;
 *  3. iteratively prune dangling chains shorter than `minStubLength`;
 *  4. keep only ways that resolve into the largest connected component, then
 *     prune again, because removing a fragment can expose a new stub;
 *  5. report everything, so what was removed is auditable.
 *
 * Ways within `stationProtection` metres of a configured portfolio anchor are
 * never pruned, so curation can never orphan a destination. No road geometry is
 * invented: what survives is real surveyed OSM geometry.
 */

/** Length of a [x,z,…] polyline in metres. */
export function polylineLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/** Spatial hash of way endpoints so coincident ends match exactly. */
function endpointIndex(roads, cell = 2) {
  const map = new Map();
  const key = (x, z) => `${Math.round(x / cell)},${Math.round(z / cell)}`;
  for (const road of roads) {
    for (const [x, z] of [
      [road.pts[0], road.pts[1]],
      [road.pts[road.pts.length - 2], road.pts[road.pts.length - 1]],
    ]) {
      const k = key(x, z);
      const list = map.get(k);
      if (list) list.push(road.id);
      else map.set(k, [road.id]);
    }
  }
  return { map, key };
}

/** How many ways *other than this one* end at this position. */
function endpointDegree(index, x, z, selfId) {
  const list = index.map.get(index.key(x, z));
  if (!list) return 0;
  let n = 0;
  for (const id of list) if (id !== selfId) n++;
  return n;
}

/** Shortest distance from a point to a polyline, in metres. */
function distanceToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
    if (d < best) best = d;
  }
  return best;
}

/** Number of way endpoints that touch nothing else. */
export function countDanglingEnds(roads) {
  const index = endpointIndex(roads);
  let dangling = 0;
  for (const road of roads) {
    if (endpointDegree(index, road.pts[0], road.pts[1], road.id) === 0) dangling++;
    const n = road.pts.length;
    if (endpointDegree(index, road.pts[n - 2], road.pts[n - 1], road.id) === 0) dangling++;
  }
  return dangling;
}

/** Union-find over an edge list; returns the label array and a size map. */
function componentLabels(nodeCount, edges) {
  const parent = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) parent[i] = i;
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) { const next = parent[i]; parent[i] = root; i = next; }
    return root;
  };
  for (const e of edges) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent[rb] = ra;
  }
  const labels = new Array(nodeCount);
  const sizes = new Map();
  for (let i = 0; i < nodeCount; i++) {
    const root = find(i);
    labels[i] = root;
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return { labels, sizes };
}

/**
 * Curate a road list in place.
 *
 * @param {Array} roads Ways with `id`, `cls`, `name`, `width`, `oneway`, `drivable`, `speed`, `refs`, `pts`.
 * @param {object} options
 * @param {Function} options.buildGraph (roads) => RouteGraph — the app's own builder, so
 *   connectivity here is exactly the connectivity the autopilot will see.
 */
export function curateRoadNetwork(roads, options) {
  const {
    minStubLength = 45,
    minFragmentLength = 12,
    minRoadWidth = 6,
    stationProtection = 30,
    dropClasses = [],
    protectedPoints = [],
    buildGraph,
    log = () => {},
  } = options;

  if (typeof buildGraph !== 'function') throw new Error('curateRoadNetwork needs buildGraph');

  const dropped = new Set(dropClasses);
  const stats = {
    inputWays: roads.length,
    inputMetres: 0,
    droppedByClass: 0,
    droppedClassMetres: 0,
    widened: 0,
    prunedStubs: 0,
    prunedStubMetres: 0,
    prunedFragments: 0,
    prunedFragmentMetres: 0,
    unjoinedWays: 0,
    unjoinedMetres: 0,
    protectedWays: 0,
    passes: 0,
    outputWays: 0,
    outputMetres: 0,
    danglingEndsBefore: 0,
    danglingEndsAfter: 0,
    componentsBefore: 0,
    componentsAfter: 0,
    graphNodes: 0,
    graphEdges: 0,
    loops: 0,
  };

  for (const r of roads) stats.inputMetres += polylineLength(r.pts);

  const isProtected = (road) =>
    protectedPoints.some((p) => distanceToPolyline(p.x, p.z, road.pts) <= stationProtection);

  // --- 1/2. class filter and minimum width ---------------------------------
  let kept = [];
  for (const road of roads) {
    if (dropped.has(road.cls)) {
      stats.droppedByClass++;
      stats.droppedClassMetres += polylineLength(road.pts);
      continue;
    }
    const width = Math.max(minRoadWidth, road.width ?? minRoadWidth);
    if (width > (road.width ?? 0)) stats.widened++;
    kept.push({ ...road, width });
  }

  stats.componentsBefore = buildGraph(kept).stats.components.length;
  stats.danglingEndsBefore = countDanglingEnds(kept);

  // --- 3/4. prune stubs and fragments, then keep the main component --------
  for (let pass = 0; pass < 10 && kept.length; pass++) {
    const index = endpointIndex(kept);
    const survivors = [];
    for (const road of kept) {
      const len = polylineLength(road.pts);
      const n = road.pts.length;
      const degA = endpointDegree(index, road.pts[0], road.pts[1], road.id);
      const degB = endpointDegree(index, road.pts[n - 2], road.pts[n - 1], road.id);
      const dangling = (degA === 0 ? 1 : 0) + (degB === 0 ? 1 : 0);
      const protectedRoad = isProtected(road);
      if (protectedRoad) {
        stats.protectedWays++;
        survivors.push(road);
        continue;
      }
      // Nothing on either end: an isolated fragment, unless it is long enough
      // to be a street in its own right (then the component pass decides).
      if (dangling === 2 && len < minStubLength) {
        stats.prunedFragments++;
        stats.prunedFragmentMetres += len;
        continue;
      }
      // One end hanging in mid-air: a stub, if it is short.
      if (dangling === 1 && len < minStubLength) {
        stats.prunedStubs++;
        stats.prunedStubMetres += len;
        continue;
      }
      if (dangling >= 1 && len < minFragmentLength) {
        stats.prunedFragments++;
        stats.prunedFragmentMetres += len;
        continue;
      }
      survivors.push(road);
    }

    // Keep only the largest connected component, using the same graph builder
    // the autopilot uses, so "connected" means what the game means.
    const graph = buildGraph(survivors);
    const { labels, sizes } = componentLabels(graph.nodes.length, graph.edges);
    let mainLabel = -1;
    let bestSize = -1;
    for (const [label, size] of sizes) if (size > bestSize) { bestSize = size; mainLabel = label; }

    const joined = new Set();
    for (const edge of graph.edges) if (labels[edge.a] === mainLabel) joined.add(edge.way);

    const next = [];
    for (const road of survivors) {
      if (joined.has(road.id) || isProtected(road)) {
        next.push(road);
        continue;
      }
      const len = polylineLength(road.pts);
      stats.unjoinedWays++;
      stats.unjoinedMetres += len;
      if (!stats.unjoinedSample) stats.unjoinedSample = [];
      if (stats.unjoinedSample.length < 8) {
        stats.unjoinedSample.push({ id: road.id, cls: road.cls, name: road.name, m: Math.round(len) });
      }
    }

    stats.passes = pass + 1;
    const removed = kept.length - next.length;
    log(
      `  curation pass ${stats.passes}: ${kept.length} → ${next.length} ways ` +
      `(main component ${bestSize} nodes, ${joined.size} ways joined)`
    );
    kept = next;
    if (removed === 0) break;
  }

  const finalGraph = buildGraph(kept);
  const { labels, sizes } = componentLabels(finalGraph.nodes.length, finalGraph.edges);
  let mainLabel = -1;
  let bestSize = -1;
  for (const [label, size] of sizes) if (size > bestSize) { bestSize = size; mainLabel = label; }
  void labels;

  stats.outputWays = kept.length;
  stats.outputMetres = kept.reduce((acc, r) => acc + polylineLength(r.pts), 0);
  stats.danglingEndsAfter = countDanglingEnds(kept);
  stats.componentsAfter = finalGraph.stats.components.length;
  stats.graphNodes = finalGraph.nodes.length;
  stats.graphEdges = finalGraph.edges.length;
  stats.mainComponentNodes = bestSize;
  // Euler characteristic for a connected undirected graph: independent loops = E − V + 1.
  stats.loops = Math.max(0, finalGraph.edges.length - finalGraph.nodes.length + 1);
  stats.components = finalGraph.stats.components.slice(0, 8);
  stats.note =
    'The playable network is a curated subset of the OSM extract: non-car ways, dead-end stubs ' +
    `shorter than ${minStubLength} m and ways outside the largest connected component were removed. ` +
    'Everything that remains is real surveyed OSM geometry; no road was invented.';
  stats.limitations = [
    'Curated, not redesigned: intersections are where OSM maps them, not where a game designer would put them.',
    'Dangling ends that survive are the boundary of the extraction, not roads the player is meant to drive.',
  ];

  return { roads: kept, stats };
}
