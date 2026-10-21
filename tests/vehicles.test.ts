import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionGrid } from '../lib/world/collision.ts';
import { advanceCar, createCar } from '../lib/world/vehicle.ts';
import {
  SPEC_SOURCE,
  UNAVAILABLE_MARQUES,
  VEHICLES,
  physicsById,
  vehicleById,
} from '../lib/world/vehicles.ts';

const bounds = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 };
const empty = createCollisionGrid([]);

function timeTo(vehicleId: string, targetKmh: number, seconds = 30): number {
  const physics = physicsById(vehicleId);
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  const target = targetKmh / 3.6;
  const dt = 1 / 120;
  for (let i = 0; i < seconds * 120; i++) {
    advanceCar(car, dt, { throttle: 1, brake: 0, steer: 0 }, { grid: empty, bounds, physics });
    if (car.speed >= target) return i * dt;
  }
  return Infinity;
}

function brakingDistance(vehicleId: string): number {
  const physics = physicsById(vehicleId);
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  car.speed = 22;
  const startZ = car.z;
  for (let i = 0; i < 120 * 12 && Math.abs(car.speed) > 0.05; i++) {
    advanceCar(car, 1 / 120, { throttle: 0, brake: 1, steer: 0 }, { grid: empty, bounds, physics });
  }
  return car.z - startZ;
}

test('catalogue entries are internally consistent and honest about specifications', () => {
  assert.ok(VEHICLES.length >= 5);
  assert.ok(UNAVAILABLE_MARQUES.length >= 15, 'the requested marques must be listed as unavailable');
  for (const v of VEHICLES) {
    assert.ok(v.id && v.make && v.model && v.trim, `${v.id} identity`);
    assert.ok(v.specSource === SPEC_SOURCE, `${v.id} must carry the estimate source`);
    assert.equal(v.modelAsset.kind, 'procedural');
    assert.ok(v.modelAsset.licence.includes('no third-party'), `${v.id} licence`);
    assert.ok(v.dimensions.length > 3.5 && v.dimensions.length < 6.5, `${v.id} length`);
    assert.ok(v.dimensions.width > 1.5 && v.dimensions.width < 2.4, `${v.id} width`);
    assert.ok(v.dimensions.wheelbase > 2.2 && v.dimensions.wheelbase < 3.8, `${v.id} wheelbase`);
    assert.ok(v.specs.massKg > 900 && v.specs.massKg < 3200, `${v.id} mass`);
    assert.ok(v.specs.zeroTo100 > 2 && v.specs.zeroTo100 < 20, `${v.id} 0-100`);
    const physics = physicsById(v.id);
    assert.ok(
      Math.abs(physics.maxSpeed * 3.6 - v.specs.inWorldTopSpeedKmh) < 0.6,
      `${v.id} in-world top speed ${physics.maxSpeed * 3.6} vs ${v.specs.inWorldTopSpeedKmh}`
    );
    assert.ok(physics.maxSpeed < v.specs.topSpeedKmh / 3.6, `${v.id} must be street-limited`);
  }
});

test('power, mass and brakes make a measurable difference on the road', () => {
  const volt = timeTo('volt', 80);
  const kestrel = timeTo('kestrel', 80);
  assert.ok(volt < kestrel, `Volt ${volt.toFixed(2)}s should beat Kestrel ${kestrel.toFixed(2)}s`);

  const suv = brakingDistance('okapi');
  const kestrelBrake = brakingDistance('kestrel');
  assert.ok(suv > kestrelBrake, `heavier SUV should need more road (${suv.toFixed(1)} vs ${kestrelBrake.toFixed(1)} m)`);
});

test('mass changes collision response, not only the HUD numbers', () => {
  const wall = createCollisionGrid([[-8, 30, 8, 30, 8, 34, -8, 34]]);
  const base = physicsById('kestrel');
  const speedAfter = (mass: number): number => {
    const physics = { ...base, mass };
    const car = createCar({ x: 0, z: 0, yaw: 0 });
    car.speed = 18;
    // Capture the speed on the contact substep. Letting the car sit against
    // the wall for five seconds reduces every car to zero and hides the
    // difference the mass term is supposed to make.
    for (let i = 0; i < 120 * 5; i++) {
      const result = advanceCar(car, 1 / 120, { throttle: 0, brake: 0, steer: 0 }, { grid: wall, bounds, physics });
      if (result.hit) return Math.abs(car.speed);
    }
    assert.fail(`mass ${mass} never reached the wall`);
    return 0;
  };
  const light = speedAfter(1290);
  const heavy = speedAfter(2140);
  assert.ok(heavy > light, `heavy car (${heavy.toFixed(2)}) should retain more speed than light (${light.toFixed(2)})`);
});

test('unknown or missing ids fall back to the default car', () => {
  assert.equal(vehicleById('does-not-exist').id, VEHICLES[0].id);
  assert.equal(vehicleById(null).id, VEHICLES[0].id);
});
