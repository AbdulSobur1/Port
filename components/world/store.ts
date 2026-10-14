import { useSyncExternalStore } from 'react';
import { spawn } from './world-layout';
import type { Point2 } from './physics';
import type { Station, ZoneId } from './world-layout';

/** Discrete UI state lives here so the 60fps simulation never triggers React renders. */
export type Mode = 'drive' | 'autopilot';

export type UiState = {
  mode: Mode;
  nearestZone: ZoneId | null;
  panelZone: ZoneId | null; // active dossier overlay
  onboarding: boolean; // controls intro / instructions overlay
  /** The "browse without driving" project list overlay. */
  directoryOpen: boolean;
  honkTick: number;
  autopilotLabel: string | null;
  autopilotRequest: { zone: ZoneId; label: string } | null;
  mapOpen: boolean;
  /** Ambient audio (engine, wind, horn) enabled. */
  soundOn: boolean;
  /** Transient user-facing message (e.g. an unreachable destination). */
  notice: string | null;
};

/**
 * Whether the visitor has already dismissed the welcome card. Stored outside the
 * reactive state because it only affects the initial mount, never a render.
 */
const WELCOME_KEY = 'soburr.world.seen-welcome';

export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* storage disabled — the welcome simply reappears next visit */
  }
}

const listeners = new Set<() => void>();
let state: UiState = {
  mode: 'drive',
  nearestZone: null,
  panelZone: null,
  onboarding: false,
  directoryOpen: false,
  honkTick: 0,
  autopilotLabel: null,
  autopilotRequest: null,
  mapOpen: false,
  notice: null,
  soundOn: true,
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

export function subscribeUi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUi(): UiState {
  return useSyncExternalStore(subscribeUi, getUi, getUi);
}

// Vehicle simulation ref used purely by `useFrame`; React never reads motion data.
export const vehicle = {
  x: spawn.x,
  z: spawn.z,
  yaw: spawn.yaw,
  speed: 0,
  steer: 0,
  touchSteer: 0,
  touchPower: 0,
  honkAge: 99,
  touchActive: false,
};

/** Snap the vehicle to a pose (used when a city mounts or the player resets). */
export function resetVehiclePose(pose: { x: number; z: number; yaw: number }) {
  vehicle.x = pose.x;
  vehicle.z = pose.z;
  vehicle.yaw = pose.yaw;
  vehicle.speed = 0;
  vehicle.steer = 0;
  vehicle.touchSteer = 0;
  vehicle.touchPower = 0;
  vehicle.touchActive = false;
  setUi({
    autopilotRequest: null,
    autopilotLabel: null,
    panelZone: null,
    directoryOpen: false,
    nearestZone: null,
    mode: 'drive',
    notice: null,
  });
}

/** Per-frame input, written by listeners outside the render loop. */
export const input = {
  forward: 0,
  reverse: 0,
  brake: false,
  left: false,
  right: false,
};

// Layout data lives in `world-layout.ts` (single source of truth shared with physics.ts).
export type { Point2, Station, ZoneId };