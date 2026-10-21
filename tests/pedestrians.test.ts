import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPopulation, stepPedestrians, type PedestrianPositions } from '../lib/world/pedestrians.ts';
import { distanceToPolyline } from '../lib/world/main-street.ts';
import { buildFurniture } from '../lib/world/props.ts';
import type { WorldData } from '../lib/world/types.ts';

const root = path.resolve(import.meta.dirname, '..');
const world = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'lagos-world.json'), 'utf8')) as WorldData;
const furniture = buildFurniture(world.roads, world.stations);
const population = buildPopulation({
  roads: world.roads,
  stations: world.stations,
  furniture,
  crossings: world.crossings ?? [],
  walkers: 40,
});

test('the street has a varied, deterministic population', () => {
  assert.ok(population.people.length >= 50, `population ${population.people.length}`);
  const kinds = new Set(population.people.map((p) => p.kind));
  for (const kind of ['walker', 'idler', 'sitter', 'crosser']) assert.ok(kinds.has(kind as never), `missing ${kind}`);
  const twice = buildPopulation({
    roads: world.roads,
    stations: world.stations,
    furniture,
    crossings: world.crossings ?? [],
    walkers: 40,
  });
  assert.deepEqual(
    twice.people.map((p) => [p.kind, Math.round(p.x * 10), Math.round(p.z * 10)]),
    population.people.map((p) => [p.kind, Math.round(p.x * 10), Math.round(p.z * 10)])
  );
});

test('walkers stay on the pavement over time and never enter a carriageway', () => {
  const out: PedestrianPositions = [];
  const car = { x: 1000, z: 1000, speed: 0, yaw: 0 };
  for (let i = 0; i < 60 * 20; i++) stepPedestrians(population, population.people, 1 / 60, car, out);
  for (const person of population.people) {
    if (person.kind !== 'walker' && person.kind !== 'crosser') continue;
    const p = population.paths[person.path];
    assert.ok(p, `${person.id} has no path`);
    const nearest = distanceToPolyline(p.p, person.x, person.z);
    assert.ok(nearest < 3, `person ${person.id} wandered ${nearest.toFixed(2)} m from the path`);
    assert.ok(Number.isFinite(person.x) && Number.isFinite(person.z));
  }
});

test('the crowd steps aside and pauses when the car approaches', () => {
  const walker = population.people.find((p) => p.kind === 'walker');
  assert.ok(walker);
  const before = { x: walker!.x, z: walker!.z, offset: walker!.offset };
  const car = { x: walker!.x, z: walker!.z, speed: 8, yaw: walker!.yaw };
  const out: PedestrianPositions = [];
  for (let i = 0; i < 30; i++) stepPedestrians(population, population.people, 1 / 60, car, out);
  assert.ok(Math.abs(walker!.offset - before.offset) > 0.15, 'offset should move away from the car');
  assert.ok(Math.hypot(walker!.x - before.x, walker!.z - before.z) < 3, 'dodge should stay local');
  assert.ok(walker!.pause > 0, 'the walker should pause');
});

test('sitters do not move', () => {
  const sitters = population.people.filter((p) => p.kind === 'sitter');
  assert.ok(sitters.length > 0);
  const before = sitters.map((p) => [p.x, p.z]);
  const out: PedestrianPositions = [];
  const car = { x: 0, z: 0, speed: 0, yaw: 0 };
  for (let i = 0; i < 300; i++) stepPedestrians(population, population.people, 1 / 60, car, out);
  sitters.forEach((p, i) => {
    assert.ok(Math.hypot(p.x - before[i][0], p.z - before[i][1]) < 1e-9, `sitter ${p.id} moved`);
  });
});
