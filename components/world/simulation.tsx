'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { vehicle as vehicleState, input, setUi, getUi, type Station, type ZoneId } from './store';
import { updateAudio } from './audio';
import type { Point2, Vehicle, World } from './physics';

type RouteState = { requestKey: string; points: Point2[]; index: number };

/** Runs the simulation outside React's render cycle and publishes only discrete UI changes. */
export function Simulation({ world, onPortal }: { world: World; onPortal?: (href: string) => void }) {
  const lastZone = useRef<ZoneId | null>(null);
  const route = useRef<RouteState | null>(null);

  const nearestStationFor = (v: { x: number; z: number }): Station | null => {
    let best: Station | null = null;
    let bestDistance = Infinity;
    for (const station of world.stations) {
      const distance = Math.hypot(v.x - station.x, v.z - station.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = station;
      }
    }
    return best;
  };

  const step = (dt: number) => {
    const v = vehicleState as unknown as Vehicle;
    const ui = getUi();
    let request = ui.autopilotRequest;

    // Manual steering or throttle always takes priority over guided navigation.
    const manualOverride = input.forward > 0 || input.reverse > 0 || input.left || input.right || input.brake ||
      vehicleState.touchPower !== 0 || vehicleState.touchSteer !== 0;
    if (request && manualOverride) {
      route.current = null;
      setUi({ autopilotRequest: null, autopilotLabel: null, mode: 'drive' });
      request = null;
    }

    let autopilotActive = false;
    if (!request) {
      route.current = null;
    } else {
      const activeRequest = request;
      const station = world.stations.find((s) => s.zone === activeRequest.zone);
      if (!station) {
        route.current = null;
      } else {
        const requestKey = `${activeRequest.zone}:${station.x}:${station.z}`;
        if (route.current?.requestKey !== requestKey) {
          const points = world.planRoute({ x: v.x, z: v.z }, { x: station.x, z: station.z });
          if (!points || points.length === 0) {
            // No collision-free route exists (destination walled off): tell the user
            // instead of driving straight through geometry.
            route.current = null;
            setUi({ autopilotRequest: null, autopilotLabel: null, mode: 'drive', notice: `No clear route to ${station.label}.` });
          } else {
            route.current = { requestKey, points, index: 0 };
          }
        }

        if (route.current) {
          autopilotActive = true;
          const activeRoute = route.current;
          while (activeRoute.index < activeRoute.points.length - 1) {
            const waypoint = activeRoute.points[activeRoute.index];
            if (Math.hypot(v.x - waypoint.x, v.z - waypoint.z) > 1.25) break;
            activeRoute.index++;
          }
          const waypoint = activeRoute.points[Math.min(activeRoute.index, activeRoute.points.length - 1)] ?? { x: station.x, z: station.z };
          const finalTarget = activeRoute.index >= activeRoute.points.length - 1;
          const { done } = world.stepAutopilot(v, dt, waypoint, finalTarget);
          if (done) {
            route.current = null;
            autopilotActive = false;
            if (station.kind === 'portal' && station.href) {
              setUi({ autopilotRequest: null, autopilotLabel: null, mode: 'drive', nearestZone: null });
              onPortal?.(station.href);
            } else {
              setUi({ autopilotRequest: null, autopilotLabel: null, mode: 'drive', nearestZone: station.zone, panelZone: station.zone });
            }
          }
        }
      }
    }

    if (!autopilotActive && (ui.panelZone || ui.onboarding || ui.directoryOpen)) {
      // The world is paused for UI interaction, but any residual velocity is gently removed.
      world.stepVehicle(v, dt, { power: 0, brake: true, steerCmd: 0 }, null);
    } else if (!autopilotActive) {
      const power = input.forward > 0 ? 1 : input.reverse > 0 ? -1 : vehicleState.touchPower;
      const steerCmd = (input.left ? -1 : 0) + (input.right ? 1 : 0) || vehicleState.touchSteer;
      world.stepVehicle(v, dt, { power, brake: input.brake, steerCmd }, nearestStationFor(v));
    }

    const near = nearestStationFor(v);
    const zone: ZoneId | null = near && Math.hypot(v.x - near.x, v.z - near.z) < near.radius ? near.zone : null;
    if (zone !== lastZone.current) {
      lastZone.current = zone;
      setUi({ nearestZone: zone });
    }
  };

  useFrame((_, dtRaw) => {
    // One simulation step per rendered frame keeps motion perfectly in step with the
    // camera and vehicle meshes (a fixed-step accumulator caused visible jitter).
    // `stepVehicle` sub-divides by distance internally, so speed is still clamped and
    // the vehicle cannot tunnel through geometry.
    step(Math.min(dtRaw, 1 / 30));
    updateAudio(vehicleState.speed);
  });

  return null;
}