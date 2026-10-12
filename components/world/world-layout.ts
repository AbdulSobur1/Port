/**
 * Single source of truth for the world's static layout.
 *
 * Both the renderer (city.tsx) and the physics/collision layer (physics.ts) import
 * from this module, so the visible geometry and the collision geometry can never
 * drift apart. This module is intentionally free of React and three.js so it can be
 * unit-tested in a plain Node environment.
 */

export type WorldId = 'hub' | 'work' | 'about' | 'contact';

/** Named in-world zones plus dynamic per-project and portal zones. */
export type NamedZone = 'home' | 'about' | 'skills' | 'contact' | 'work';
export type ZoneId = NamedZone | `project:${string}` | `portal:${string}`;

/**
 * A station is a navigation marker. `place` opens a dossier, `project` opens a project
 * dossier, and `portal` navigates to another city (its `href`).
 */
export type StationKind = 'place' | 'project' | 'portal';

export type Station = {
  zone: ZoneId;
  label: string;
  sub: string;
  x: number;
  z: number;
  yaw: number;
  color: string;
  /** Soft activation radius. Stations are navigation markers, NOT solid obstacles. */
  radius: number;
  kind?: StationKind;
  /** Route to navigate to when this station is a portal. */
  href?: string;
};

/** Weather effects available to a city. */
export type WorldWeather = 'clear' | 'rain' | 'snow';

/** Visual + gameplay theme for a city. */
export type WorldTheme = {
  background: string;
  fog: readonly [string, number, number];
  ambient: readonly [string, number];
  hemisphere: readonly [string, string, number];
  sun: { position: readonly [number, number, number]; intensity: number; color: string };
  /** Hour of day (0–24) around which the light of this city drifts. */
  time: number;
  /** Optional gentle drift band `[start, end]` (hours); loops slowly when present. */
  timeBand?: readonly [number, number];
  /** Sky tint above the horizon (the top of the sky dome). */
  zenith: string;
  /** Weather effects active in this city. */
  weather?: WorldWeather;
};

/** A fully self-contained city: its geometry, collision data and destinations. */
export type WorldLayout = {
  id: WorldId;
  name: string;
  bounds: number;
  spawn: { x: number; z: number; yaw: number };
  theme: WorldTheme;
  landmark: { x: number; z: number; radius: number } | null;
  buildings: BuildingSpec[];
  lampPositions: ReadonlyArray<readonly [number, number]>;
  treePositions: ReadonlyArray<readonly [number, number, number]>;
  perimeterWalls: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }>;
  stations: Station[];
};

// Ring of destinations around the central landmark.
export const stations: Station[] = [
  { zone: 'home', label: 'Home', sub: 'Arrival plaza', x: 0, z: 14, yaw: Math.PI, color: '#d8f851', radius: 2.2 },
  { zone: 'project:proofmesh', label: 'ProofMesh', sub: 'AI / trust infrastructure', x: -9.5, z: -3.5, yaw: Math.PI / 4, color: '#b8f53d', radius: 2.0 },
  { zone: 'project:africonnect', label: 'AfriConnect', sub: 'Culture / travel / commerce', x: -3.5, z: -9.5, yaw: Math.PI / 2, color: '#6de0dd', radius: 2.0 },
  { zone: 'project:bytebank', label: 'byteBANK', sub: 'Fintech / full stack', x: 3.5, z: -9.5, yaw: -Math.PI / 2, color: '#ffb467', radius: 2.0 },
  { zone: 'project:ummahconnect', label: 'UmmahConnect', sub: 'Community / platform', x: 9.5, z: -3.5, yaw: Math.PI / 4, color: '#ff7863', radius: 2.0 },
  { zone: 'project:medcore', label: 'MedCore', sub: 'Healthcare / operations', x: 0, z: -12.5, yaw: 0, color: '#a28cff', radius: 2.0 },
  { zone: 'portal:work', label: 'Work District', sub: 'Enter the work', x: -14, z: 14, yaw: Math.PI / 4, color: '#d8f851', radius: 2.2, kind: 'portal', href: '/work' },
  { zone: 'portal:about', label: 'Reflection Gardens', sub: 'About Soburr', x: -12.5, z: 11, yaw: -Math.PI / 2, color: '#cdd5ce', radius: 2.2, kind: 'portal', href: '/about' },
  { zone: 'skills', label: 'Systems', sub: 'Skills', x: 12.5, z: 11, yaw: Math.PI / 2, color: '#cdd5ce', radius: 2.2, kind: 'place' },
  { zone: 'portal:contact', label: 'Signal Station', sub: 'Contact', x: 14, z: 14, yaw: Math.PI / 4, color: '#d8f851', radius: 2.2, kind: 'portal', href: '/contact' },
];

export const stationByZone = (zone: ZoneId): Station | undefined => stations.find((station) => station.zone === zone);

export type BuildingStyle = 'slab' | 'terrace' | 'spire' | 'loft';

export type BuildingSpec = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tint: string;
  accent: string;
  style: BuildingStyle;
};

// Perimeter buildings. These ARE solid obstacles (see physics.ts).
export const buildings: BuildingSpec[] = [
  { x: -21.5, z: -17, w: 3.8, d: 4.4, h: 8.5, tint: '#263b39', accent: '#6de0dd', style: 'terrace' },
  { x: -16.4, z: -21.3, w: 4.1, d: 3.6, h: 5.8, tint: '#253331', accent: '#d8f851', style: 'loft' },
  { x: -10.2, z: -21.2, w: 3.6, d: 4.1, h: 10.2, tint: '#202e30', accent: '#a28cff', style: 'spire' },
  { x: -3.9, z: -21.7, w: 4.6, d: 3.8, h: 6.4, tint: '#293b38', accent: '#ffb467', style: 'slab' },
  { x: 3.2, z: -21.4, w: 4.4, d: 4.2, h: 8.2, tint: '#253b3a', accent: '#6de0dd', style: 'terrace' },
  { x: 9.7, z: -21.5, w: 3.6, d: 3.8, h: 5.4, tint: '#2a3634', accent: '#ff7863', style: 'loft' },
  { x: 16.1, z: -21.3, w: 4.4, d: 4.2, h: 9.4, tint: '#202d2f', accent: '#a28cff', style: 'spire' },
  { x: 21.4, z: -16.3, w: 3.8, d: 4.3, h: 6.8, tint: '#293b38', accent: '#d8f851', style: 'terrace' },
  { x: 21.3, z: -9.6, w: 4.2, d: 3.5, h: 11.5, tint: '#202f30', accent: '#6de0dd', style: 'spire' },
  { x: 21.4, z: -2.9, w: 3.8, d: 4.2, h: 7.1, tint: '#283a37', accent: '#ffb467', style: 'slab' },
  { x: 21.4, z: 4.2, w: 4.1, d: 3.6, h: 5.7, tint: '#263634', accent: '#a28cff', style: 'loft' },
  { x: 21.2, z: 10.5, w: 3.6, d: 4.3, h: 8.9, tint: '#20302f', accent: '#d8f851', style: 'terrace' },
  { x: 16.5, z: 21.2, w: 4.2, d: 3.8, h: 7.2, tint: '#293a37', accent: '#6de0dd', style: 'loft' },
  { x: 10.1, z: 21.5, w: 3.8, d: 4.1, h: 10.5, tint: '#202f30', accent: '#a28cff', style: 'spire' },
  { x: 3.6, z: 21.4, w: 4.5, d: 3.7, h: 6.1, tint: '#293a37', accent: '#ff7863', style: 'slab' },
  { x: -3.2, z: 21.5, w: 3.7, d: 4.1, h: 8.6, tint: '#263835', accent: '#d8f851', style: 'terrace' },
  { x: -9.7, z: 21.2, w: 4.4, d: 3.8, h: 5.6, tint: '#263634', accent: '#ffb467', style: 'loft' },
  { x: -16.1, z: 21.3, w: 3.9, d: 4.3, h: 9.8, tint: '#202f30', accent: '#6de0dd', style: 'spire' },
  { x: -21.3, z: 15.2, w: 4.1, d: 3.7, h: 6.2, tint: '#293a37', accent: '#a28cff', style: 'slab' },
  { x: -21.5, z: 8.4, w: 3.7, d: 4.2, h: 10.4, tint: '#20302f', accent: '#d8f851', style: 'spire' },
  { x: -21.4, z: 1.8, w: 4.2, d: 3.6, h: 7.6, tint: '#263835', accent: '#ff7863', style: 'terrace' },
  { x: -21.3, z: -5.1, w: 3.8, d: 4.1, h: 5.9, tint: '#293a37', accent: '#6de0dd', style: 'loft' },
  { x: -21.4, z: -11.5, w: 4.2, d: 3.8, h: 9.2, tint: '#20302f', accent: '#ffb467', style: 'spire' },
];

// Solid street furniture. Format: [x, z] for lamps, [x, z, scale] for planter trees.
export const lampPositions: ReadonlyArray<readonly [number, number]> = [
  [-15.5, -14], [-15.5, -4], [-15.5, 6], [-15.5, 16],
  [15.5, -14], [15.5, -4], [15.5, 6],
  [-14, -15.5], [-4, -15.5], [6, -15.5], [16, -15.5],
  [-14, 15.5], [-4, 15.5], [6, 15.5],
];

export const treePositions: ReadonlyArray<readonly [number, number, number]> = [
  [-13.3, -13.3, 0.82], [-13.3, -6.4, 0.7], [-13.2, 4.5, 0.82],
  [13.3, -13.3, 0.82], [13.3, -6.4, 0.7], [13.2, 4.5, 0.82],
  [-6.5, -13.3, 0.72], [6.5, -13.3, 0.72], [-6.5, 13.3, 0.72], [6.5, 13.3, 0.72],
];

/** Central landmark. Solid cylindrical structure at the plaza centre. */
export const landmark = { x: 0, z: 0, radius: 3.6 };

/**
 * Low perimeter wall that fills the gaps between the ring buildings and forms a clean,
 * continuous city boundary. Without it, the ~1.7 m slots between adjacent buildings were
 * just wide enough for the car to squeeze into and get stuck.
 */
export const perimeterWalls: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }> = [
  { x: 0, z: -21.3, hx: 23, hz: 2.3 },
  { x: 0, z: 21.3, hx: 23, hz: 2.3 },
  { x: 21.3, z: 0, hx: 2.3, hz: 23 },
  { x: -21.3, z: 0, hx: 2.3, hz: 23 },
];

/** Hard rectangular limit of the drivable world (matches the floor/road extent). */
export const WORLD_BOUNDS = 24;

/** Default vehicle spawn / reset pose. Verified to be clear of every solid collider. */
export const spawn = { x: 0, z: 14, yaw: Math.PI };

/** The default city: the arrival-hub with featured project stations and portals. */
export const hubLayout: WorldLayout = {
  id: 'hub',
  name: 'Arrival Hub',
  bounds: WORLD_BOUNDS,
  spawn,
  theme: {
    background: '#09100f',
    fog: ['#09100f', 26, 54],
    ambient: ['#c8d9c8', 0.48],
    hemisphere: ['#8bb9ac', '#101715', 0.85],
    sun: { position: [12, 19, 8], intensity: 1.65, color: '#e6f1dc' },
    time: 18,
    timeBand: [17.3, 21.7],
    zenith: '#05090b',
    weather: 'clear',
  },
  landmark,
  buildings,
  lampPositions,
  treePositions,
  perimeterWalls,
  stations,
};
