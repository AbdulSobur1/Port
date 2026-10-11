import { useSyncExternalStore } from 'react';

/** Discrete UI state lives here so the 60fps simulation never triggers React renders. */
export type Mode = 'drive' | 'autopilot';
export type ZoneId = 'home' | 'about' | 'skills' | 'contact' | 'project:proofmesh' | 'project:africonnect' | 'project:bytebank' | 'project:ummahconnect' | 'project:medcore';

export type UiState = {
  mode: Mode;
  nearestZone: ZoneId | null;
  panelZone: ZoneId | null; // active dossier overlay
  onboarding: boolean; // controls intro / instructions overlay
  honkTick: number;
  autopilotLabel: string | null;
  autopilotRequest: { zone: ZoneId; label: string } | null;
  mapOpen: boolean;
};

const listeners = new Set<() => void>();
let state: UiState = {
  mode: 'drive',
  nearestZone: null,
  panelZone: null,
  onboarding: true,
  honkTick: 0,
  autopilotLabel: null,
  autopilotRequest: null,
  mapOpen: false,
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
  x: 0,
  z: 14,
  yaw: Math.PI,
  speed: 0,
  steer: 0,
  touchSteer: 0,
  touchPower: 0,
  honkAge: 99,
  touchActive: false,
};

/** Per-frame input, written by listeners outside the render loop. */
export const input = {
  forward: 0,
  reverse: 0,
  brake: false,
  left: false,
  right: false,
};

export type Station = {
  zone: ZoneId;
  label: string;
  sub: string;
  x: number;
  z: number;
  yaw: number;
  color: string;
  radius: number;
};

// Ring of destinations around the central landmark.
// XY/Yaw kept in sync with the station meshes in district.tsx.
export const stations: Station[] = [
  { zone: 'home', label: 'Home', sub: 'Arrival plaza', x: 0, z: 14, yaw: Math.PI, color: '#d8f851', radius: 2.2 },
  { zone: 'project:proofmesh', label: 'ProofMesh', sub: 'AI / trust infrastructure', x: -9.5, z: -3.5, yaw: Math.PI / 4, color: '#b8f53d', radius: 2.0 },
  { zone: 'project:africonnect', label: 'AfriConnect', sub: 'Culture / travel / commerce', x: -3.5, z: -9.5, yaw: Math.PI / 2, color: '#6de0dd', radius: 2.0 },
  { zone: 'project:bytebank', label: 'byteBANK', sub: 'Fintech / full stack', x: 3.5, z: -9.5, yaw: -Math.PI / 2, color: '#ffb467', radius: 2.0 },
  { zone: 'project:ummahconnect', label: 'UmmahConnect', sub: 'Community / platform', x: 9.5, z: -3.5, yaw: Math.PI / 4, color: '#ff7863', radius: 2.0 },
  { zone: 'project:medcore', label: 'MedCore', sub: 'Healthcare / operations', x: 0, z: -12.5, yaw: 0, color: '#a28cff', radius: 2.0 },
  { zone: 'about', label: 'Archive', sub: 'About Soburr', x: -12.5, z: 11, yaw: -Math.PI / 2, color: '#cdd5ce', radius: 2.0 },
  { zone: 'skills', label: 'Systems', sub: 'Skills', x: 12.5, z: 11, yaw: Math.PI / 2, color: '#cdd5ce', radius: 2.0 },
  { zone: 'contact', label: 'Signal Room', sub: 'Contact', x: 14, z: 14, yaw: Math.PI / 4, color: '#d8f851', radius: 2.0 },
];

export const stationByZone = (zone: ZoneId): Station | undefined => stations.find((station) => station.zone === zone);
