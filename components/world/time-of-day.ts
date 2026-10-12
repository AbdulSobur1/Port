/**
 * Stylised time-of-day. The world is intentionally theatrical rather than photoreal,
 * so this samples a small, curated palette from the hour of day instead of a physical
 * sky model. Each city declares a base hour and an optional slow drift band, so the
 * light breathes gently around a mood (dusk, night, midday) instead of racing through a
 * full 24h cycle.
 *
 * Pure and dependency-free so it can be reasoned about and unit-tested.
 */

import type { WorldTheme } from './world-layout';

export type DayPalette = {
  hour: number;
  /** 0 at night, 1 at midday. */
  dayFactor: number;
  sun: { position: [number, number, number]; intensity: number; color: string };
  moon: { position: [number, number, number]; opacity: number };
  ambient: { intensity: number; color: string };
  hemi: { sky: string; ground: string; intensity: number };
  fog: string;
  sky: { zenith: string; horizon: string };
  /** 0..1 star opacity. */
  stars: number;
};

type RGB = { r: number; g: number; b: number };

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

function hexToRgb(hex: string): RGB {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp(t, 0, 1);
  return rgbToHex({ r: ca.r + (cb.r - ca.r) * k, g: ca.g + (cb.g - ca.g) * k, b: ca.b + (cb.b - ca.b) * k });
}

/** Multiply a colour towards black (amount 0..1). */
export function darken(hex: string, amount: number): string {
  return lerpHex(hex, '#000000', clamp(amount, 0, 1));
}

/** Blend a colour towards white (amount 0..1). */
export function lighten(hex: string, amount: number): string {
  return lerpHex(hex, '#ffffff', clamp(amount, 0, 1));
}

const LOOP_SECONDS = 150;

/** Animate the hour inside the theme's drift band (or around its fixed hour). */
export function animateHour(theme: WorldTheme, elapsed: number): number {
  if (!theme.timeBand) return theme.time;
  const [start, end] = theme.timeBand;
  const progress = (Math.sin((elapsed / LOOP_SECONDS) * Math.PI * 2) + 1) / 2;
  return start + (end - start) * progress;
}

const SUN_RADIUS = 34;

export function samplePalette(hour: number, theme: WorldTheme): DayPalette {
  const norm = ((hour % 24) + 24) % 24;
  // 6h dawn, 12h zenith, 18h dusk.
  const elevation = Math.sin(((norm - 6) / 12) * Math.PI);
  const dayFactor = clamp(elevation, 0, 1);
  const warm = clamp(Math.sin(((norm - 15.5) / 6) * Math.PI), 0, 1); // golden hour near ~18.5h
  const azimuth = ((norm - 6) / 12) * Math.PI;

  const sunPosition: [number, number, number] = [
    Math.sin(azimuth) * SUN_RADIUS * 0.85,
    Math.max(2, elevation) * SUN_RADIUS * 0.8,
    Math.cos(azimuth) * SUN_RADIUS * 0.85,
  ];

  const sunColor = lerpHex(theme.sun.color, '#ff9a52', 0.2 + 0.6 * warm);
  const horizon = lerpHex(darken(theme.ambient[0], 0.3), theme.sun.color, 0.45 * warm);
  const zenith = lerpHex(theme.zenith, lighten(theme.ambient[0], 0.18), 0.7 * dayFactor);

  const moonOpacity = clamp(1.2 - dayFactor * 2, 0, 1);

  return {
    hour: norm,
    dayFactor,
    sun: {
      position: sunPosition,
      intensity: theme.sun.intensity * (0.2 + 0.8 * dayFactor),
      color: sunColor,
    },
    moon: {
      position: [-sunPosition[0] * 0.8, Math.abs(sunPosition[1]) * 0.7 + 6, -sunPosition[2] * 0.8],
      opacity: clamp(Math.max(dayFactor * 0.4, 0.55), 0, 1) * (1 - dayFactor),
    },
    ambient: { intensity: theme.ambient[1] * (0.42 + 0.58 * dayFactor), color: theme.ambient[0] },
    hemi: {
      sky: lerpHex(theme.hemisphere[0], '#0a1216', 1 - dayFactor),
      ground: theme.hemisphere[1],
      intensity: theme.hemisphere[2] * (0.55 + 0.45 * dayFactor),
    },
    fog: lerpHex(theme.fog[0], lerpHex(darken(theme.ambient[0], 0.2), sunColor, 0.35 * warm), 0.5),
    sky: {
      zenith: lerpHex(theme.zenith, lighten(theme.ambient[0], 0.15), 0.75 * dayFactor),
      horizon: lerpHex(darken(theme.ambient[0], 0.3), lighten(sunColor, 0.12), 0.55 * warm),
    },
    stars: clamp(1 - dayFactor * 1.35, 0, 0.9),
  };
}