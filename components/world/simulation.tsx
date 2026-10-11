'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { stations, vehicle as vehicleState, input, setUi, getUi, type Station, type ZoneId } from './store';
import { stepVehicle, stepAutopilot, type Vehicle } from './physics';

/**
 * Runs at 60fps inside R3F. Mutates the plain `vehicle` object and publishes
 * only discrete UI changes (nearest zone) to the external store.
 */
export function Simulation() {
  const lastZone = useRef<ZoneId | null>(null);
  const lastHonk = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const v = vehicleState as unknown as Vehicle;
    const ui = getUi();
    const request = ui.autopilotRequest;

    if (request) {
      const station = stations.find((s) => s.zone === request.zone);
      if (station) {
        const { done } = stepAutopilot(v, dt, { x: station.x, z: station.z });
        if (done) {
          setUi({ autopilotRequest: null, autopilotLabel: null, mode: 'drive', nearestZone: station.zone, panelZone: station.zone });
        }
      }
    } else if (ui.panelZone || ui.onboarding) {
      // Overlay open: park the vehicle, ignore drive input so HUD controls never steer the player
      stepVehicle(v, dt, { power: 0, brake: false, steerCmd: 0 }, nearestStationFor(v));
    } else {
      const power = input.forward > 0 ? 1 : input.reverse > 0 ? -1 : vehicleState.touchPower;
      const steerCmd = (input.left ? -1 : 0) + (input.right ? 1 : 0) || vehicleState.touchSteer;
      const nearest = nearestStationFor(v);
      stepVehicle(v, dt, { power, brake: input.brake, steerCmd }, nearest);
    }

    const near = nearestStationFor(v);
    const zone: ZoneId | null = near && dist(v, near) < near.radius ? near.zone : null;
    if (zone !== lastZone.current) {
      lastZone.current = zone;
      setUi({ nearestZone: zone });
    }

    // Honk feedback decays in sim, exposes a discrete tick to the HUD
    vehicleState.honkAge = Math.min(99, vehicleState.honkAge + dt);
  });

  return null;
}

function dist(v: { x: number; z: number }, s: Station) {
  return Math.hypot(v.x - s.x, v.z - s.z);
}

function nearestStationFor(v: { x: number; z: number }): Station | null {
  let best: Station | null = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = dist(v, s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
