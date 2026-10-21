'use client';

import type { RouteGraph } from '@/lib/geo/graph';
import { planToStation } from '@/lib/world/autopilot';
import type { StationData } from '@/lib/world/types';
import { auto, runtime, resetAuto, setUi, toast } from './store';

/**
 * Start an autopilot drive to a destination.
 *
 * Planning happens against the real road graph; if the destination's road is
 * not connected to the car's road the request fails with a reason instead of
 * inventing a path. The route is then followed by `Simulation` and drawn on
 * both the map and the ground — the same polyline in both places.
 */
export function navigateTo(zone: string, graph: RouteGraph, stations: StationData[]): boolean {
  const rt = runtime.current;
  const station = stations.find((s) => s.zone === zone);
  if (!rt || !station) {
    setUi({ autopilot: { zone, label: zone, status: 'failed', message: 'That destination is not in this world.' } });
    return false;
  }
  const label = station.label;
  resetAuto();
  setUi({ autopilot: { zone, label, status: 'planning' }, panel: null });

  const plan = planToStation(graph, rt.car, station);
  if (!plan.ok) {
    setUi({
      autopilot: {
        zone,
        label,
        status: 'failed',
        message: plan.message,
      },
    });
    toast(plan.message);
    return false;
  }

  auto.route = plan.route.p;
  auto.cursor = 0;
  auto.station = station;
  auto.stuckSeconds = 0;
  rt.route = plan.route.p;
  rt.routeId += 1;
  setUi({ autopilot: { zone, label, status: 'driving' } });
  return true;
}

export function cancelNavigation(reason?: string) {
  resetAuto();
  setUi({ autopilot: null, panel: null });
  if (reason) toast(reason);
}

export function returnToStart(graph: RouteGraph, stations: StationData[]) {
  const home = stations.find((s) => s.zone === 'home');
  if (home) navigateTo('home', graph, stations);
}
