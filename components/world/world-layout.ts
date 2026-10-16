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

/**
 * An axis-aligned stretch of road, described by its centre line. Roads carry no
 * collision (the car drives freely over them) — they are the visual armature the
 * geometry and destinations are placed against.
 */
export type Road = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  kind?: 'arterial' | 'street' | 'lane';
};

/** A concentric ring road around a point (e.g. a landmark roundabout). */
export type Ring = { x: number; z: number; radius: number; width: number };

/** A named quarter of a city. Purely visual/thematic — it never affects collision. */
export type District = { name: string; x: number; z: number; radius: number; color: string };

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
  /** Surface road network drawn beneath the city (see city.tsx `Roads`). */
  roads: Road[];
  /** Ring roads / roundabouts. */
  rings?: Ring[];
  /** Themed quarters for subtle ground tinting and architectural grouping. */
  districts?: District[];
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
  { x: -21.5, z: -17, w: 3.8, d: 4.4, h: 8.5, tint: '#d9d3c6', accent: '#6de0dd', style: 'terrace' },
  { x: -16.4, z: -21.3, w: 4.1, d: 3.6, h: 5.8, tint: '#cfc9bc', accent: '#d8f851', style: 'loft' },
  { x: -10.2, z: -21.2, w: 3.6, d: 4.1, h: 10.2, tint: '#e2dccf', accent: '#a28cff', style: 'spire' },
  { x: -3.9, z: -21.7, w: 4.6, d: 3.8, h: 6.4, tint: '#d3cdc0', accent: '#ffb467', style: 'slab' },
  { x: 3.2, z: -21.4, w: 4.4, d: 4.2, h: 8.2, tint: '#dcd6c9', accent: '#6de0dd', style: 'terrace' },
  { x: 9.7, z: -21.5, w: 3.6, d: 3.8, h: 5.4, tint: '#cdc7ba', accent: '#ff7863', style: 'loft' },
  { x: 16.1, z: -21.3, w: 4.4, d: 4.2, h: 9.4, tint: '#e6e0d3', accent: '#a28cff', style: 'spire' },
  { x: 21.4, z: -16.3, w: 3.8, d: 4.3, h: 6.8, tint: '#d3cdc0', accent: '#d8f851', style: 'terrace' },
  { x: 21.3, z: -9.6, w: 4.2, d: 3.5, h: 11.5, tint: '#d8d2c5', accent: '#6de0dd', style: 'spire' },
  { x: 21.4, z: -2.9, w: 3.8, d: 4.2, h: 7.1, tint: '#cbc5b8', accent: '#ffb467', style: 'slab' },
  { x: 21.4, z: 4.2, w: 4.1, d: 3.6, h: 5.7, tint: '#dad4c7', accent: '#a28cff', style: 'loft' },
  { x: 21.2, z: 10.5, w: 3.6, d: 4.3, h: 8.9, tint: '#d0cabd', accent: '#d8f851', style: 'terrace' },
  { x: 16.5, z: 21.2, w: 4.2, d: 3.8, h: 7.2, tint: '#d5cfc2', accent: '#6de0dd', style: 'loft' },
  { x: 10.1, z: 21.5, w: 3.8, d: 4.1, h: 10.5, tint: '#d8d2c5', accent: '#a28cff', style: 'spire' },
  { x: 3.6, z: 21.4, w: 4.5, d: 3.7, h: 6.1, tint: '#d5cfc2', accent: '#ff7863', style: 'slab' },
  { x: -3.2, z: 21.5, w: 3.7, d: 4.1, h: 8.6, tint: '#d8d2c5', accent: '#d8f851', style: 'terrace' },
  { x: -9.7, z: 21.2, w: 4.4, d: 3.8, h: 5.6, tint: '#dad4c7', accent: '#ffb467', style: 'loft' },
  { x: -16.1, z: 21.3, w: 3.9, d: 4.3, h: 9.8, tint: '#d8d2c5', accent: '#6de0dd', style: 'spire' },
  { x: -21.3, z: 15.2, w: 4.1, d: 3.7, h: 6.2, tint: '#d5cfc2', accent: '#a28cff', style: 'slab' },
  { x: -21.5, z: 8.4, w: 3.7, d: 4.2, h: 10.4, tint: '#d0cabd', accent: '#d8f851', style: 'spire' },
  { x: -21.4, z: 1.8, w: 4.2, d: 3.6, h: 7.6, tint: '#d8d2c5', accent: '#ff7863', style: 'terrace' },
  { x: -21.3, z: -5.1, w: 3.8, d: 4.1, h: 5.9, tint: '#d5cfc2', accent: '#6de0dd', style: 'loft' },
  { x: -21.4, z: -11.5, w: 4.2, d: 3.8, h: 9.2, tint: '#d0cabd', accent: '#ffb467', style: 'spire' },
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
    background: '#dbe7ee',
    fog: ['#e2eaee', 32, 62],
    ambient: ['#ffffff', 0.55],
    hemisphere: ['#cfe4f2', '#d9d3c4', 0.9],
    sun: { position: [14, 22, 10], intensity: 1.4, color: '#fff4e6' },
    time: 12,
    timeBand: [11, 14],
    zenith: '#6fb7e6',
    weather: 'clear',
  },
  landmark,
  buildings,
  lampPositions,
  treePositions,
  perimeterWalls,
  stations,
  // The hub is a cardinal grid: two arterials crossing at the plaza, with a
  // secondary street each side, all bounded by the perimeter wall.
  roads: [
    { x1: 0, z1: -24, x2: 0, z2: 24, width: 5.5, kind: 'arterial' },
    { x1: -9.1, z1: -24, x2: -9.1, z2: 24, width: 3.2 },
    { x1: 9.1, z1: -24, x2: 9.1, z2: 24, width: 3.2 },
    { x1: -24, z1: 0, x2: 24, z2: 0, width: 5.5, kind: 'arterial' },
    { x1: -24, z1: -9.1, x2: 24, z2: -9.1, width: 3.2 },
    { x1: -24, z1: 9.1, x2: 24, z2: 9.1, width: 3.2 },
  ],
  // The five districts of the hub (brief §Districts). Arrival frames the spawn,
  // Work and Innovation hold the project + systems anchors, Reflection Gardens
  // is the quieter west quarter and the central Landmark plaza binds them.
  districts: [
    { name: 'Arrival Plaza', x: 0, z: 15, radius: 6.6, color: '#d8f851' },
    { name: 'Work Quarter', x: 0, z: -15, radius: 6.6, color: '#a28cff' },
    { name: 'Innovation Yard', x: 14, z: 12, radius: 6.2, color: '#6de0dd' },
    { name: 'Reflection Gardens', x: -15, z: 11, radius: 6.4, color: '#8fd36a' },
    { name: 'Landmark Commons', x: 0, z: 0, radius: 7.4, color: '#ffd479' },
  ],
};
