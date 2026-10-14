/**
 * Real-world map configuration for the ground layer.
 *
 * The default is a keyless OpenStreetMap raster style, so the map works out of the
 * box with no account. If you deploy at scale, point `NEXT_PUBLIC_MAP_STYLE_URL` at
 * your own MapLibre style (vector or raster) to respect OSM's tile usage policy.
 * Set `NEXT_PUBLIC_WORLD_MAP=off` to disable the map entirely and keep the purely
 * procedural ground.
 */

import type { StyleSpecification } from 'maplibre-gl';

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';

/** A caller-supplied style overrides the built-in keyless OSM raster style. */
export function mapStyleUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  return url && url.trim() ? url.trim() : null;
}

export function mapStyle(): string | StyleSpecification {
  const url = mapStyleUrl();
  if (url) return url;
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

/** The map is on unless explicitly disabled. */
export function mapEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_WORLD_MAP ?? 'on').toLowerCase() !== 'off';
}
