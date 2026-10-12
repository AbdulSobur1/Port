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
      tint: '#202e30', accent: project.color, style: STYLES[i % STYLES.length],
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
      background: '#070f12',
      fog: ['#070f12', 30, 60],
      ambient: ['#c4d6dd', 0.5],
      hemisphere: ['#7fb0c4', '#0e1518', 0.82],
      sun: { position: [16, 22, -10], intensity: 1.5, color: '#e8f2ff' },
      time: 22,
      timeBand: [21, 1.5],
      zenith: '#04080d',
      weather: 'rain',
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
  };
}

/** About city: a quiet plaza around a central monument. */
function makeAboutCity(): WorldLayout {
  const buildings: BuildingSpec[] = [
    { x: -9, z: -8, w: 4, d: 3.4, h: 5.2, tint: '#263b39', accent: '#6de0dd', style: 'terrace' },
    { x: 9, z: -8, w: 4, d: 3.4, h: 6.4, tint: '#202e30', accent: '#a28cff', style: 'spire' },
    { x: -9, z: 8, w: 3.6, d: 3.6, h: 4.2, tint: '#293a37', accent: '#d8f851', style: 'loft' },
    { x: 9, z: 8, w: 3.6, d: 3.6, h: 5.6, tint: '#263634', accent: '#ffb467', style: 'slab' },
  ];
  const stations: Station[] = [
    { zone: 'about', label: 'About Soburr', sub: 'Who and why', x: -6, z: 4, yaw: Math.PI / 2, color: '#d8f851', radius: 2.2, kind: 'place' },
    { zone: 'skills', label: 'Systems', sub: 'Skills & tools', x: 6, z: 4, yaw: -Math.PI / 2, color: '#6de0dd', radius: 2.2, kind: 'place' },
    { zone: 'portal:hub', label: 'Return to the Hub', sub: 'Exit city', x: 0, z: 11, yaw: Math.PI, color: '#cdd5ce', radius: 2.2, kind: 'portal', href: '/' },
  ];
  return {
    id: 'about', name: 'Reflection Gardens', bounds: 18, spawn: { x: 0, z: 9.5, yaw: Math.PI },
    theme: {
      background: '#08110f',
      fog: ['#08110f', 22, 46],
      ambient: ['#cfe0d6', 0.5],
      hemisphere: ['#93c3ac', '#0f1714', 0.9],
      sun: { position: [10, 18, 12], intensity: 1.7, color: '#e8f4dd' },
      time: 11,
      timeBand: [9.5, 12.5],
      zenith: '#0b1613',
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
  };
}

/** Contact city: a compact terminal courtyard. */
function makeContactCity(): WorldLayout {
  const buildings: BuildingSpec[] = [
    { x: -8, z: -6, w: 4, d: 3.6, h: 6.8, tint: '#202e30', accent: '#6de0dd', style: 'spire' },
    { x: 8, z: -6, w: 4, d: 3.6, h: 5.4, tint: '#263b39', accent: '#a28cff', style: 'terrace' },
    { x: -8, z: 6, w: 3.8, d: 3.2, h: 4.6, tint: '#293a37', accent: '#ffb467', style: 'loft' },
    { x: 8, z: 6, w: 3.8, d: 3.2, h: 6, tint: '#263634', accent: '#d8f851', style: 'slab' },
  ];
  const stations: Station[] = [
    { zone: 'contact', label: 'Signal Room', sub: 'Get in touch', x: 0, z: -5, yaw: 0, color: '#d8f851', radius: 2.4, kind: 'place' },
    { zone: 'portal:hub', label: 'Return to the Hub', sub: 'Exit city', x: 0, z: 9, yaw: Math.PI, color: '#cdd5ce', radius: 2.2, kind: 'portal', href: '/' },
  ];
  return {
    id: 'contact', name: 'Signal Station', bounds: 16, spawn: { x: 0, z: 7.5, yaw: Math.PI },
    theme: {
      background: '#0a0f16',
      fog: ['#0a0f16', 20, 42],
      ambient: ['#cdd8e6', 0.5],
      hemisphere: ['#8f9fd0', '#12141d', 0.9],
      sun: { position: [-12, 18, 10], intensity: 1.5, color: '#e6ecff' },
      time: 2,
      timeBand: [1.5, 3.5],
      zenith: '#070b16',
      weather: 'snow',
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
