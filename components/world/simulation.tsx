'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { CollisionGrid } from '@/lib/world/collision';
import type { RouteGraph } from '@/lib/geo/graph';
import { snapToGraph } from '@/lib/geo/graph';
import type { StationData } from '@/lib/world/types';
import { advanceCar, type DriveCommand } from '@/lib/world/vehicle';
import { physicsById } from '@/lib/world/vehicles';
import { routeLength } from '@/lib/world/autopilot';
import {
  boundaryAhead,
  clearanceBehind,
  pedestrianAlongRoute,
  routeClearance,
  stepDriveFsm,
} from '@/lib/world/drive-fsm';
import {
  auto,
  getUi,
  input,
  resetAuto,
  runtime,
  setTelemetry,
  setUi,
  toast,
  touchInput,
  useUi,
} from './store';
import { cancelNavigation, navigateTo } from './navigation';

/**
 * The only place the car moves.
 *
 * Player input is read from the shared mutable `input`/`touchInput` objects, so
 * React never re-renders at 60 fps. Autopilot and manual driving produce the
 * same `DriveCommand`, which means the autopilot is subject to exactly the same
 * physics, collisions and boundaries as the player — it cannot cheat through a
 * building.
 */
export function Simulation({
  grid,
  bounds,
  graph,
  stations,
}: {
  grid: CollisionGrid;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  graph: RouteGraph;
  stations: StationData[];
}) {
  const { vehicleId } = useUi();
  const physics = useMemo(() => physicsById(vehicleId), [vehicleId]);
  const lastPublish = useRef(0);
  const lastNear = useRef<string | null>(null);
  const lastRoadCheck = useRef(0);
  const roadName = useRef<string | null>(null);

  useFrame((_, dtRaw) => {
    const rt = runtime.current;
    if (!rt) return;
    const dt = Math.min(0.1, dtRaw);
    const car = rt.car;
    const ui = getUi();

    // --- manual override of an active autopilot -------------------------
    const manual = input.forward || input.reverse || input.left || input.right || input.brake || touchInput.active;
    if (ui.autopilot?.status === 'driving' && manual) {
      cancelNavigation('Manual control — autopilot disengaged.');
    }

    // --- command --------------------------------------------------------
    let command: DriveCommand;
    if (auto.route) {
      // Sensors follow the *route*, so a building around the corner is not
      // mistaken for a head-on obstacle.
      const people = rt.pedestrians ?? [];
      const routeGap = routeClearance(auto.route, auto.cursor, grid);
      const peopleGap = pedestrianAlongRoute(auto.route, auto.cursor, people);
      const ahead = Math.min(routeGap, peopleGap);
      const result = stepDriveFsm(auto.route, car, auto.fsm, dt, {
        ahead,
        behind: clearanceBehind(grid, car),
        boundary: boundaryAhead(bounds, car),
        reason: ahead < 3.5 ? (peopleGap <= routeGap ? 'pedestrian' : 'obstacle') : undefined,
      });
      auto.cursor = result.cursor;
      command = result.command;

      if (result.replan && auto.station && auto.replans < 1) {
        const zone = auto.station.zone;
        const keep = auto.replans + 1;
        toast('Route blocked — re-planning from this road.');
        navigateTo(zone, graph, stations);
        auto.replans = keep;
      }

      if (result.state === 'SAFE_FAILURE') {
        const zone = auto.station?.zone ?? ui.autopilot?.zone ?? 'home';
        const label = auto.station?.label ?? 'destination';
        const message = result.message ?? 'The road is blocked and cannot be recovered safely.';
        resetAuto();
        rt.route = null;
        setUi({ autopilot: { zone, label, status: 'failed', message } });
        toast(message);
      } else if (result.arrived) {
        const zone = auto.station?.zone ?? ui.autopilot?.zone ?? 'home';
        const label = auto.station?.label ?? 'destination';
        resetAuto();
        rt.route = null;
        setUi({
          autopilot: { zone, label, status: 'arrived' },
          panel: zone,
          nearby: zone,
        });
        window.setTimeout(() => {
          if (getUi().autopilot?.status === 'arrived') setUi({ autopilot: null });
        }, 4200);
      } else if (ui.autopilot?.status === 'driving') {
        // Publish FSM state changes, not every frame.
        if (ui.autopilot.state !== result.state || ui.autopilot.message !== (result.message ?? undefined)) {
          setUi({
            autopilot: { ...ui.autopilot, state: result.state, message: result.message ?? undefined },
          });
        }
      }
    } else {
      const throttle = input.forward ? 1 : input.reverse ? -1 : touchInput.throttle;
      const brake = input.brake ? 1 : touchInput.brake;
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0) || touchInput.steer;
      command = { throttle, brake, steer };
    }

    // --- physics --------------------------------------------------------
    advanceCar(car, dt, command, { grid, bounds, physics });
    rt.route = auto.route;

    // --- telemetry (throttled so React stays idle) ----------------------
    const now = performance.now();
    if (now - lastPublish.current > 120) {
      lastPublish.current = now;
      if (now - lastRoadCheck.current > 600) {
        lastRoadCheck.current = now;
        const snap = snapToGraph(graph, car.x, car.z, undefined);
        roadName.current = snap.distance < 26 ? graph.edges[snap.edge].name : null;
      }
      setTelemetry({
        speed: Math.abs(car.speed),
        gear: car.speed < -0.4 ? 'R' : Math.abs(car.speed) < 0.4 ? 'N' : 'D',
        road: roadName.current,
        x: car.x,
        z: car.z,
        yaw: car.yaw,
        routeRemaining: auto.route ? Math.max(0, routeLength(auto.route) - auto.cursor) : 0,
        battery: car.sinceHit < 0.6 ? 'hit' : 'ok',
      });
    }

    // --- station proximity ---------------------------------------------
    let near: StationData | null = null;
    let best = 34;
    for (const s of stations) {
      const d = Math.hypot(car.x - s.x, car.z - s.z);
      if (d < best) { best = d; near = s; }
    }
    const nearZone = near?.zone ?? null;
    if (nearZone !== lastNear.current) {
      lastNear.current = nearZone;
      if (getUi().nearby !== nearZone) setUi({ nearby: nearZone });
    }
  });

  return null;
}
