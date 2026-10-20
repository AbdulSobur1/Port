'use client';

import { useSyncExternalStore } from 'react';
import type { CarState } from '@/lib/world/vehicle';
import { createFsmMemory, type FsmMemory, type AutoState } from '@/lib/world/drive-fsm';
import { DEFAULT_VEHICLE_ID, vehicleById } from '@/lib/world/vehicles';
import type { GraphPayload, Provenance, StationData, WorldData } from '@/lib/world/types';

/**
 * Discrete UI state lives here so the 60 fps simulation never triggers React
 * renders. Continuous values (speed, position) are published at ~8 Hz into
 * `telemetry`, which only the small readouts subscribe to.
 */

export type AutopilotStatus = 'planning' | 'driving' | 'arrived' | 'failed';

export type AutopilotUi = {
  zone: string;
  label: string;
  status: AutopilotStatus;
  message?: string;
  /** Explicit FSM state, shown in the driving prompt. */
  state?: AutoState;
};

export type UiState = {
  phase: 'loading' | 'ready' | 'error';
  loadingLabel: string;
  error: string | null;
  panel: string | null;
  /** Destination rail visibility (shared by the top bar toggle and the rail). */
  rail: boolean;
  mapOpen: boolean;
  mapExpanded: boolean;
  intro: boolean;
  autopilot: AutopilotUi | null;
  nearby: string | null;
  toast: { id: number; text: string } | null;
  reducedMotion: boolean;
  touch: boolean;
  /** Selected catalogue id. */
  vehicleId: string;
  /** First-run / "change car" vehicle chooser. */
  vehicleSelect: boolean;
};

const listeners = new Set<() => void>();

let state: UiState = {
  phase: 'loading',
  loadingLabel: 'Loading the Lagos dataset…',
  error: null,
  panel: null,
  rail: false,
  mapOpen: false,
  mapExpanded: false,
  intro: true,
  autopilot: null,
  nearby: null,
  toast: null,
  reducedMotion: false,
  touch: false,
  vehicleId: DEFAULT_VEHICLE_ID,
  vehicleSelect: false,
};

export function setUi(update: Partial<UiState>) {
  let changed = false;
  for (const key of Object.keys(update) as (keyof UiState)[]) {
    if (state[key] !== update[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
}

export function getUi(): UiState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUi(): UiState {
  return useSyncExternalStore(subscribe, getUi, getUi);
}

/* ------------------------------------------------------------------ */
/* Telemetry (published from the simulation at ~8 Hz)                  */
/* ------------------------------------------------------------------ */

export type Telemetry = {
  speed: number;
  gear: 'D' | 'R' | 'N';
  road: string | null;
  /** World position, used by the map marker. */
  x: number;
  z: number;
  yaw: number;
  routeRemaining: number;
  battery: 'ok' | 'hit';
};

let telemetry: Telemetry = {
  speed: 0,
  gear: 'N',
  road: null,
  x: 0,
  z: 0,
  yaw: 0,
  routeRemaining: 0,
  battery: 'ok',
};
const telemetryListeners = new Set<() => void>();

export function setTelemetry(update: Partial<Telemetry>) {
  let changed = false;
  for (const key of Object.keys(update) as (keyof Telemetry)[]) {
    if (telemetry[key] !== update[key]) { changed = true; break; }
  }
  if (!changed) return;
  telemetry = { ...telemetry, ...update };
  telemetryListeners.forEach((l) => l());
}

export function getTelemetry(): Telemetry {
  return telemetry;
}

export function useTelemetry(): Telemetry {
  return useSyncExternalStore(
    (l) => { telemetryListeners.add(l); return () => telemetryListeners.delete(l); },
    getTelemetry,
    getTelemetry
  );
}

/* ------------------------------------------------------------------ */
/* Mutable runtime shared with the render loop                         */
/* ------------------------------------------------------------------ */

export const input = {
  forward: false,
  reverse: false,
  brake: false,
  left: false,
  right: false,
};

/** Analog touch input (-1…1). Keyboard stays boolean. */
export const touchInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  active: false,
};

export type WorldRuntime = {
  world: WorldData;
  graph: GraphPayload;
  provenance: Provenance;
  stations: StationData[];
  car: CarState;
  /** Route polyline in world metres, or null when driving manually. */
  route: number[] | null;
  /** Live pedestrian positions, used by the autopilot sensor and the map. */
  pedestrians?: { x: number; z: number }[];
  /** Bumped whenever the route changes so overlays can rebuild. */
  routeId: number;
};

export const runtime: { current: WorldRuntime | null } = { current: null };

/** Autopilot bookkeeping, kept out of React state. */
export const auto = {
  route: null as number[] | null,
  cursor: 0,
  station: null as StationData | null,
  stuckSeconds: 0,
  fsm: createFsmMemory(),
  /** How many times this drive has re-planned to escape a blockage. */
  replans: 0,
};

export function resetAuto() {
  auto.route = null;
  auto.cursor = 0;
  auto.station = null;
  auto.stuckSeconds = 0;
  auto.fsm = createFsmMemory();
  auto.replans = 0;
  if (runtime.current) runtime.current.route = null;
}

export type { FsmMemory, AutoState };

/** Sidebar/rail content is derived from projects; this only picks the open one. */
export function openDestination(zone: string) {
  setUi({ panel: zone, mapOpen: false });
}

export function closePanel() {
  setUi({ panel: null });
}

const VEHICLE_KEY = 'soburr.vehicle.v1';

/** Persist the chosen car and close the chooser. */
export function chooseVehicle(id: string) {
  const vehicle = vehicleById(id);
  setUi({ vehicleId: vehicle.id, vehicleSelect: false });
  try {
    window.localStorage.setItem(VEHICLE_KEY, vehicle.id);
  } catch {
    /* private mode: the choice simply does not persist */
  }
  resetAuto();
}

export function storedVehicleId(): string | null {
  try {
    const id = window.localStorage.getItem(VEHICLE_KEY);
    return id ? vehicleById(id).id : null;
  } catch {
    return null;
  }
}

let toastId = 0;
export function toast(text: string) {
  setUi({ toast: { id: ++toastId, text } });
  window.setTimeout(() => {
    if (getUi().toast?.text === text) setUi({ toast: null });
  }, 3800);
}

export function announce(text: string) {
  const el = document.getElementById('world-live-region');
  if (el) el.textContent = text;
}
