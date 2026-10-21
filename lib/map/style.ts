/**
 * MapLibre style for the local Lagos PMTiles archive.
 *
 * Hand-written against the OpenMapTiles schema that Planetiler emits, because
 * the point of the map is to prove the *data* is ours: no demo style, no
 * third-party tile endpoint. Only glyphs (Noto Sans, OFL-1.1) and the tile
 * archive itself are fetched, both from this origin.
 */

import type { StyleSpecification } from 'maplibre-gl';

const INK = '#cdd8d2';
const MUTED = '#8ea39c';

export function buildMapStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Lagos — local OSM extract',
    glyphs: '/map/fonts/{fontstack}/{range}.pbf',
    sources: {
      lagos: {
        type: 'vector',
        url: 'pmtiles:///map/lagos.pmtiles',
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · ' +
          '<a href="https://openmaptiles.org" target="_blank" rel="noreferrer">© OpenMapTiles</a> · ' +
          '<a href="https://protomaps.com" target="_blank" rel="noreferrer">PMTiles</a>',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a1214' } },

      {
        id: 'landcover',
        type: 'fill',
        source: 'lagos',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            'wood', '#14251a',
            'grass', '#16261b',
            'farmland', '#1a2417',
            '#111d1b',
          ],
          'fill-opacity': 0.85,
        },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'lagos',
        'source-layer': 'landuse',
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            'residential', '#121b1c',
            'commercial', '#161f21',
            'industrial', '#191c1d',
            'cemetery', '#152019',
            '#121a1b',
          ],
          'fill-opacity': 0.6,
        },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'lagos',
        'source-layer': 'park',
        paint: { 'fill-color': '#17281c', 'fill-opacity': 0.9 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'lagos',
        'source-layer': 'water',
        paint: { 'fill-color': '#0d1d24' },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'lagos',
        'source-layer': 'waterway',
        paint: { 'line-color': '#123039', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 3] },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'lagos',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-color': '#1b2426',
          'fill-outline-color': '#283436',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.55, 15, 0.8],
        },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'lagos',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'class'], 'path'], ['!=', ['get', 'class'], 'steps'], ['!=', ['get', 'class'], 'ferry']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#070d0e',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, ['match', ['get', 'class'],
              'motorway', 2.4, 'trunk', 2.4, 'primary', 2.4,
              'secondary', 1.7, 'tertiary', 1.7,
              0.8],
            16, ['match', ['get', 'class'],
              'motorway', 13, 'trunk', 13, 'primary', 13,
              'secondary', 10, 'tertiary', 10,
              'residential', 6.5, 'service', 6.5,
              2.5],
          ],
        },
      },
      {
        id: 'road',
        type: 'line',
        source: 'lagos',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'class'], 'path'], ['!=', ['get', 'class'], 'steps'], ['!=', ['get', 'class'], 'ferry']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'class'],
            'motorway', '#4a4f45',
            'trunk', '#4a4f45',
            'primary', '#41463f',
            'secondary', '#383d39',
            'tertiary', '#383d39',
            'footway', '#2b3330',
            'pedestrian', '#2b3330',
            'cycleway', '#2b3330',
            '#2f3532',
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, ['match', ['get', 'class'],
              'motorway', 1.6, 'trunk', 1.6, 'primary', 1.6,
              'secondary', 1.1, 'tertiary', 1.1,
              0.5],
            16, ['match', ['get', 'class'],
              'motorway', 10, 'trunk', 10, 'primary', 10,
              'secondary', 7.5, 'tertiary', 7.5,
              'residential', 4.6, 'service', 4.6,
              1.6],
          ],
        },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'lagos',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name'], ['get', 'ref']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9.5, 17, 12],
          'text-letter-spacing': 0.04,
          'symbol-spacing': 320,
        },
        paint: {
          'text-color': MUTED,
          'text-halo-color': '#080f10',
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'place',
        type: 'symbol',
        source: 'lagos',
        'source-layer': 'place',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'island', 'city', 'town']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 15, 15],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.18,
        },
        paint: { 'text-color': INK, 'text-halo-color': '#060c0d', 'text-halo-width': 1.6, 'text-opacity': 0.85 },
      },
      {
        id: 'poi',
        type: 'circle',
        source: 'lagos',
        'source-layer': 'poi',
        minzoom: 15,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.6, 17, 3],
          'circle-color': '#7f9c93',
          'circle-opacity': 0.55,
        },
      },
      {
        id: 'poi-label',
        type: 'symbol',
        source: 'lagos',
        'source-layer': 'poi',
        minzoom: 15.5,
        filter: ['<=', ['coalesce', ['get', 'rank'], 99], 12],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: { 'text-color': '#9fb3ab', 'text-halo-color': '#070e0f', 'text-halo-width': 1.1, 'text-opacity': 0.8 },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'lagos',
        'source-layer': 'water_name',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-letter-spacing': 0.24,
          'text-transform': 'uppercase',
        },
        paint: { 'text-color': '#4d7c86', 'text-halo-color': '#08141a', 'text-halo-width': 1 },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'lagos',
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 6],
        paint: { 'line-color': '#2b3a3a', 'line-width': 0.8, 'line-dasharray': [3, 3] },
      },
    ],
  };
}

/** Attribution string reused by the map control and the footer. */
export const MAP_ATTRIBUTION =
  '© OpenStreetMap contributors (ODbL) · Vector tiles built locally from the 2026-10-15 Geofabrik Nigeria extract · PMTiles';
