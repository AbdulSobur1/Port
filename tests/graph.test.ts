import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRouteGraph,
  findRoute,
  mainComponentNode,
  nearestNode,
  pointAlong,
  snapToGraph,
  weaklyConnectedComponents,
  type RoadInput,
} from '../lib/geo/graph.ts';

function road(partial: Partial<RoadInput> & Pick<RoadInput, 'id' | 'refs' | 'pts'>): RoadInput {
  return {
    cls: 'residential',
    name: 'Test Street',
    width: 7,
    oneway: 0,
    drivable: true,
    speed: 9,
    ...partial,
  };
}

/** A grid: two parallel north-south roads joined at both ends. */
function gridGraph() {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2, 3], pts: [0, 0, 0, 50, 0, 100] }),
    road({ id: 2, refs: [4, 5, 6], pts: [100, 0, 100, 50, 100, 100] }),
    road({ id: 3, refs: [3, 6], pts: [0, 100, 100, 100] }),
    road({ id: 4, refs: [1, 4], pts: [0, 0, 100, 0] }),
  ];
  return buildRouteGraph(roads);
}

test('graph builds junction nodes and edges', () => {
  const g = gridGraph();
  // Only corners are junctions; mid-way vertices stay as edge geometry.
  assert.equal(g.nodes.length, 4);
  assert.equal(g.edges.length, 4);
  assert.deepEqual(g.stats.components, [4]);
  assert.equal(g.stats.junctionCount, 4);
  // The straight road keeps its middle vertex in the polyline.
  const longEdge = g.edges.find((e) => e.len > 90)!;
  assert.ok(longEdge.p.length >= 6, `edge geometry ${longEdge.p.length}`);
});

test('two-way edges are traversable in both directions', () => {
  const g = gridGraph();
  const start = g.index.get(1)!;
  const end = g.index.get(3)!;
  const result = findRoute(g, start, end);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.ok(result.route.length >= 99, `length ${result.route.length}`);
  assert.ok(result.route.edges.length >= 1);
  assert.ok(Number.isFinite(result.route.duration) && result.route.duration > 0);
});

test('one-way edges only allow travel in their direction', () => {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2], pts: [0, 0, 0, 100], oneway: 1 }),
    road({ id: 2, refs: [2, 3], pts: [0, 100, 0, 200] }),
  ];
  const g = buildRouteGraph(roads);
  const forward = findRoute(g, g.index.get(1)!, g.index.get(2)!);
  const backward = findRoute(g, g.index.get(2)!, g.index.get(1)!);
  assert.ok(forward.ok, 'forward route should exist');
  assert.ok(!backward.ok, 'reverse route must not use a one-way street');
  if (!backward.ok) assert.equal(backward.reason, 'disconnected');
});

test('oneway=-1 is normalised into travel direction', () => {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2], pts: [0, 0, 0, 100], oneway: -1 }),
  ];
  const g = buildRouteGraph(roads);
  const start = g.index.get(2)!; // geometry start, but travel is 2 -> 1
  const end = g.index.get(1)!;
  const result = findRoute(g, start, end);
  assert.ok(result.ok);
  if (!result.ok) return;
  // Route must start at node 2's position and end at node 1's.
  assert.ok(Math.abs(result.route.p[1] - 100) < 1e-6, `start z ${result.route.p[1]}`);
  assert.ok(Math.abs(result.route.p[result.route.p.length - 1] - 0) < 1e-6);
});

test('disconnected components are reported, not routed through', () => {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2], pts: [0, 0, 0, 50] }),
    road({ id: 2, refs: [3, 4], pts: [500, 500, 500, 560] }),
  ];
  const g = buildRouteGraph(roads);
  const result = findRoute(g, g.index.get(1)!, g.index.get(3)!);
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.reason, 'disconnected');
  assert.deepEqual(g.stats.components, [2, 2]);
});

test('turn restrictions ban the illegal manoeuvre', () => {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2], pts: [0, 0, 0, 100] }),
    road({ id: 2, refs: [2, 3], pts: [0, 100, 100, 100] }),
    road({ id: 3, refs: [2, 4], pts: [0, 100, -100, 100] }),
  ];
  const g = buildRouteGraph(roads, [{ from: 1, to: 2, via: 2, kind: 'no_left_turn' }]);
  assert.equal(g.banned.length, 1);
  const banned = g.banned[0].map((n) => g.nodes[n].x);
  assert.ok(banned.includes(0), `banned triple ${JSON.stringify(g.banned)}`);
  const blocked = findRoute(g, g.index.get(1)!, g.index.get(3)!);
  assert.ok(!blocked.ok || blocked.route.p.some((v) => v < -90), 'route must avoid the banned right turn');
});

test('nearestNode and snapToGraph agree on a mid-edge car', () => {
  const g = gridGraph();
  const snap = snapToGraph(g, 1.2, 25);
  assert.ok(snap.distance < 1.3, `snap distance ${snap.distance}`);
  assert.ok(Math.abs(snap.z - 25) < 1e-6);
  const near = nearestNode(g, 1.2, 25);
  assert.ok(near.distance < 26);
  const node = g.nodes[near.index];
  assert.ok(g.nodes.some((n) => n.x === node.x && n.z === node.z));
});

test('pointAlong walks a polyline in order', () => {
  const p = [0, 0, 0, 10, 10, 10];
  const a = pointAlong(p, 5);
  assert.ok(Math.abs(a.x) < 1e-6 && Math.abs(a.z - 5) < 1e-6);
  const b = pointAlong(p, 15);
  assert.ok(Math.abs(b.x - 5) < 1e-6 && Math.abs(b.z - 10) < 1e-6);
  assert.ok(Math.abs(b.heading - Math.PI / 2) < 1e-6);
});

test('union-find counts components correctly', () => {
  assert.deepEqual(weaklyConnectedComponents(5, [{ a: 0, b: 1 }, { a: 1, b: 2 }]).sort((a, b) => b - a), [3, 1, 1]);
});

test('mainComponentNode returns a node in the biggest component', () => {
  const roads: RoadInput[] = [
    road({ id: 1, refs: [1, 2], pts: [0, 0, 0, 50] }),
    road({ id: 2, refs: [3, 4], pts: [500, 500, 500, 560] }),
    road({ id: 3, refs: [4, 5], pts: [500, 560, 500, 620] }),
  ];
  const g = buildRouteGraph(roads);
  const idx = mainComponentNode(g);
  const node = g.nodes[idx];
  assert.ok(node.x > 400, `expected the larger eastern component, got x=${node.x}`);
});
