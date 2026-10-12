import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, VEHICLE_RADIUS, type Point2, type Vehicle } from '../components/world/physics';
import { worldLayouts } from '../components/world/world-cities';

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
const dt = 1 / 60;

function makeVehicle(x: number, z: number, yaw: number): Vehicle {
  return { x, z, yaw, speed: 0, steer: 0, honkAge: 99 };
}

for (const [id, layout] of Object.entries(worldLayouts) as [string, (typeof worldLayouts)['hub']][]) {
  const world = createWorld(layout);

  function overlapsAny(v: { x: number; z: number }): boolean {
    const eps = 1e-3;
    for (const c of world.colliders) {
      if (c.type === 'circle') {
        if (Math.hypot(v.x - c.x, v.z - c.z) < c.r + VEHICLE_RADIUS - eps) return true;
      } else {
        const dx = (v.x - c.x) - clamp(v.x - c.x, -c.hx, c.hx);
        const dz = (v.z - c.z) - clamp(v.z - c.z, -c.hz, c.hz);
        if (Math.hypot(dx, dz) < VEHICLE_RADIUS - eps) return true;
      }
    }
    return false;
  }

  test(`[${id}] spawn is clear and inside bounds`, () => {
    assert.equal(overlapsAny(layout.spawn), false, 'spawn overlaps an obstacle');
    assert.ok(Math.abs(layout.spawn.x) <= layout.bounds && Math.abs(layout.spawn.z) <= layout.bounds);
  });

  test(`[${id}] every station is drivable and reachable from the spawn`, () => {
    const clearance = VEHICLE_RADIUS + 0.1;
    const key = (x: number, z: number) => `${x},${z}`;
    const seen = new Set<string>([key(Math.round(layout.spawn.x), Math.round(layout.spawn.z))]);
    const queue: Point2[] = [{ x: layout.spawn.x, z: layout.spawn.z }];
    while (queue.length) {
      const current = queue.shift()!;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = Math.round(current.x + ox);
        const nz = Math.round(current.z + oz);
        const k = key(nx, nz);
        if (seen.has(k)) continue;
        if (!world.isPointDrivable(nx, nz, clearance)) continue;
        seen.add(k);
        queue.push({ x: nx, z: nz });
      }
    }
    for (const station of world.stations) {
      assert.equal(world.isPointDrivable(station.x, station.z, clearance), true, `${id}: ${station.label} is not drivable`);
      assert.equal(seen.has(key(Math.round(station.x), Math.round(station.z))), true, `${id}: ${station.label} is unreachable`);
    }
  });

  test(`[${id}] autopilot reaches every station without clipping geometry`, () => {
    for (const station of world.stations) {
      const route = world.planRoute({ x: layout.spawn.x, z: layout.spawn.z }, { x: station.x, z: station.z });
      assert.ok(route && route.length > 0, `${id}: no route planned to ${station.label}`);
      const v = makeVehicle(layout.spawn.x, layout.spawn.z, layout.spawn.yaw);
      let index = 0;
      let reached = false;
      let clipped = false;
      for (let frame = 0; frame < 60 * 45; frame++) {
        while (index < route!.length - 1 && Math.hypot(v.x - route![index].x, v.z - route![index].z) < 1.25) index++;
        const waypoint = route![Math.min(index, route!.length - 1)];
        const { done } = world.stepAutopilot(v, dt, waypoint, index >= route!.length - 1);
        if (overlapsAny(v)) clipped = true;
        if (done) { reached = true; break; }
      }
      assert.equal(clipped, false, `${id}: autopilot clipped geometry en route to ${station.label}`);
      assert.equal(reached, true, `${id}: autopilot failed to reach ${station.label}`);
      assert.ok(Math.hypot(v.x - station.x, v.z - station.z) < 3, `${id}: stopped far from ${station.label}`);
    }
  });
}