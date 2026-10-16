/**
 * The four cities of the world. Each is a fully self-contained `WorldLayout` so the
 * physics, camera and HUD can be instantiated per route without shared state.
 */

import { projects } from '../../lib/projects';
import { hubLayout, type BuildingSpec, type Station, type WorldLayout, type WorldId } from './world-layout';

export type { WorldId };

const STYLES = ['slab', 'terrace', 'spire', 'loft'] as const;

/** Work city: every project is a plot on a boulevard that loops around a central monument. */
function makeWorkCity(): WorldLayout {
  const buildings: BuildingSpec[] = [];
  const stations: Station[] = [];
  const perSide = Math.ceil(projects.length / 2);
  const step = 3.6;
  const zStart = -((perSide - 1) * step) / 2;

  projects.forEach((project, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const z = zStart + row * step;
    buildings.push({
      x: side * 10, z, w: 4, d: 2.6, h: 3.4 + (i % 5) * 0.9,
      tint: '#dcd6c9', accent: project.color, style: STYLES[i % STYLES.length],
    });
    stations.push({
      zone: `project:${project.slug}`, label: project.title, sub: project.category,
      x: side * 5.5, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      color: project.color, radius: 1.9, kind: 'project',
    });
  });

  stations.push({ zone: 'portal:hub', label: 'Return to the Hub', sub: 'Exit city', x: 0, z: -18.5, yaw: 0, color: '#d8f851', radius: 2.2, kind: 'portal', href: '/' });

  return {
    id: 'work', name: 'Work District', bounds: 24, spawn: { x: 0, z: 18, yaw: Math.PI },
    theme: {
      background: '#dde7ec',
      fog: ['#dde7ec', 34, 66],
      ambient: ['#ffffff', 0.55],
      hemisphere: ['#d6e6f2', '#d3cdc0', 0.9],
      sun: { position: [16, 22, -10], intensity: 1.35, color: '#fdf6ea' },
      time: 13,
      timeBand: [12, 14.5],
      zenith: '#77b6e0',
      weather: 'clear',
    },
    landmark: { x: 0, z: 0, radius: 2.6 },
    buildings,
    lampPositions: [[-2.6, -15], [-2.6, -9], [-2.6, -3], [-2.6, 3], [-2.6, 9], [-2.6, 15], [2.6, -12], [2.6, -6], [2.6, 0], [2.6, 6], [2.6, 12]],
    treePositions: [[16, 6, 0.85], [-16, 6, 0.85], [16, -6, 0.85], [-16, -6, 0.85]],
    perimeterWalls: [
      { x: 0, z: -22, hx: 22, hz: 2 },
      { x: 0, z: 22, hx: 22, hz: 2 },
      { x: 22, z: 0, hx: 2, hz: 22 },
      { x: -22, z: 0, hx: 2, hz: 22 },
    ],
    stations,
    roads: [
      { x1: 0, z1: -32, x2: 0, z2: 32, width: 6, kind: 'arterial' },
      { x1: -16, z1: 0, x2: 16, z2: 0, width: 4, kind: 'street' },
    ],
    rings: [{ x: 0, z: 0, radius: 2.6, width: 5.6 }],
    districts: [
      { name: 'North Plots', x: 0, z: 12, radius: 6, color: '#6de0dd' },
      { name: 'South Gate', x: 0, z: -14, radius: 6, color: '#d8f851' },
    ],
  };
}

/** About city: a quiet plaza around a central monument. */
function makeAboutCity(): WorldLayout {
  const buildings: BuildingSpec[] = [
    { x: -9, z: -8, w: 4, d: 3.4, h: 5.2, tint: '#d9d3c6', accent: '#6de0dd', style: 'terrace' },
    { x: 9, z: -8, w: 4, d: 3.4, h: 6.4, tint: '#e2dccf', accent: '#a28cff', style: 'spire' },
    { x: -9, z: 8, w: 3.6, d: 3.6, h: 4.2, tint: '#d5cfc2', accent: '#d8f851', style: 'loft' },
    { x: 9, z: 8, w: 3.6, d: 3.6, h: 5.6, tint: '#dad4c7', accent: '#ffb467', style: 'slab' },
  ];
  const stations: Station[] = [
    { zone: 'about', label: 'About Soburr', sub: 'Who and why', x: -6, z: 4, yaw: Math.PI / 2, color: '#d8f851', radius: 2.2, kind: 'place' },
    { zone: 'skills', label: 'Systems', sub: 'Skills & tools', x: 6, z: 4, yaw: -Math.PI / 2, color: '#6de0dd', radius: 2.2, kind: 'place' },
    { zone: 'portal:hub', label: 'Return to the Hub', sub: 'Exit city', x: 0, z: 11, yaw: Math.PI, color: '#cdd5ce', radius: 2.2, kind: 'portal', href: '/' },
  ];
  return {
    id: 'about', name: 'Reflection Gardens', bounds: 18, spawn: { x: 0, z: 9.5, yaw: Math.PI },
    theme: {
      background: '#dfeae4',
      fog: ['#dfeae4', 30, 62],
      ambient: ['#ffffff', 0.6],
      hemisphere: ['#d8ecdf', '#d9d3c4', 0.95],
      sun: { position: [12, 24, 8], intensity: 1.5, color: '#fff6e2' },
      time: 12,
      timeBand: [10.5, 13.5],
      zenith: '#8cc6e8',
      weather: 'clear',
    },
    landmark: { x: 0, z: -1, radius: 2.8 },
    buildings,
    lampPositions: [[-4, 0], [4, 0], [-4, -8], [4, -8]],
    treePositions: [[-11, 0, 0.9], [11, 0, 0.9], [0, -12, 0.8], [-11, 8, 0.7], [11, 8, 0.7]],
    perimeterWalls: [
      { x: 0, z: -14, hx: 14, hz: 2 }, { x: 0, z: 14, hx: 14, hz: 2 },
      { x: 14, z: 0, hx: 2, hz: 14 }, { x: -14, z: 0, hx: 2, hz: 14 },
    ],
    stations,
    roads: [
      { x1: 0, z1: -28, x2: 0, z2: 28, width: 6, kind: 'arterial' },
      { x1: -22, z1: 0, x2: 22, z2: 0, width: 4.5, kind: 'street' },
    ],
    rings: [{ x: 0, z: -1, radius: 2.8, width: 5.6 }],
    districts: [
      { name: 'About Court', x: -7, z: -6, radius: 5.5, color: '#6de0dd' },
      { name: 'Systems Lawn', x: 7, z: -6, radius: 5.5, color: '#d8f851' },
    ],
  };
}

/** Contact city: a compact terminal courtyard. */
function makeContactCity(): WorldLayout {
  const buildings: BuildingSpec[] = [
    { x: -8, z: -6, w: 4, d: 3.6, h: 6.8, tint: '#e2dccf', accent: '#6de0dd', style: 'spire' },
    { x: 8, z: -6, w: 4, d: 3.6, h: 5.4, tint: '#d9d3c6', accent: '#a28cff', style: 'terrace' },
    { x: -8, z: 6, w: 3.8, d: 3.2, h: 4.6, tint: '#d5cfc2', accent: '#ffb467', style: 'loft' },
    { x: 8, z: 6, w: 3.8, d: 3.2, h: 6, tint: '#dad4c7', accent: '#d8f851', style: 'slab' },
  ];
  const stations: Station[] = [
    { zone: 'contact', label: 'Signal Room', sub: 'Get in touch', x: 0, z: -5, yaw: 0, color: '#d8f851', radius: 2.4, kind: 'place' },
    { zone: 'portal:hub', label: 'Return to the Hub', sub: 'Exit city', x: 0, z: 9, yaw: Math.PI, color: '#cdd5ce', radius: 2.2, kind: 'portal', href: '/' },
  ];
  return {
    id: 'contact', name: 'Signal Station', bounds: 16, spawn: { x: 0, z: 7.5, yaw: Math.PI },
    theme: {
      background: '#e0e4ee',
      fog: ['#e0e4ee', 30, 60],
      ambient: ['#ffffff', 0.58],
      hemisphere: ['#dae0f2', '#d6d0c6', 0.92],
      sun: { position: [10, 23, 12], intensity: 1.4, color: '#fdf3ea' },
      time: 11,
      timeBand: [9.5, 12.5],
      zenith: '#84bce0',
      weather: 'clear',
    },
    landmark: { x: 0, z: 0, radius: 2.4 },
    buildings,
    lampPositions: [[9, -9], [-9, -9], [9, 9], [-9, 9]],
    treePositions: [[-10, 0, 0.8], [10, 0, 0.8]],
    perimeterWalls: [
      { x: 0, z: -12, hx: 12, hz: 2 }, { x: 0, z: 12, hx: 12, hz: 2 },
      { x: 12, z: 0, hx: 2, hz: 12 }, { x: -12, z: 0, hx: 2, hz: 12 },
    ],
    stations,
    roads: [
      { x1: 0, z1: -26, x2: 0, z2: 26, width: 6, kind: 'arterial' },
      { x1: -20, z1: 0, x2: 20, z2: 0, width: 4.5, kind: 'street' },
    ],
    rings: [{ x: 0, z: 0, radius: 2.4, width: 5 }],
  };
}

export const worldLayouts: Record<WorldId, WorldLayout> = {
  hub: hubLayout,
  work: makeWorkCity(),
  about: makeAboutCity(),
  contact: makeContactCity(),
};

export const getLayout = (id: WorldId): WorldLayout => worldLayouts[id];

export const worldMeta: Record<WorldId, { name: string; tagline: string }> = {
  hub: { name: 'Arrival Hub', tagline: 'The gateway to the work' },
  work: { name: 'Work District', tagline: 'Every project, one street' },
  about: { name: 'Reflection Gardens', tagline: 'The person behind the work' },
  contact: { name: 'Signal Station', tagline: 'Open a channel' },
};
