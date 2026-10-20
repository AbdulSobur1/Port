'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { createProjection, type Projection } from '@/lib/geo/projection';
import { buildMapStyle } from '@/lib/map/style';
import { destinationByZone } from '@/lib/world/destinations';
import type { StationData } from '@/lib/world/types';
import { openDestination, runtime, setUi, useTelemetry, useUi } from './store';

/**
 * The geographic map: MapLibre GL rendering our own PMTiles archive (built from
 * the OSM extract), with the vehicle, destination stations and the active
 * route drawn over it. Compact by default; expand for the full city.
 *
 * The map is a sibling of the 3D canvas, not a wrapper around it, so a tile
 * failure can never take the world down.
 */

let protocolRegistered = false;

export function MapPanel() {
  const { mapOpen, mapExpanded, autopilot } = useUi();
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const projectionRef = useRef<Projection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleReady, setStyleReady] = useState(false);

  const rt = runtime.current;

  useEffect(() => {
    if (!mapOpen || mapRef.current || !container.current || !rt) return;
    let cancelled = false;

    (async () => {
      try {
        const maplibregl = await import('maplibre-gl');
        const { Protocol } = await import('pmtiles');
        if (!protocolRegistered) {
          const protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
          // The bundler moves the module away from the worker file MapLibre
          // looks for, so point it at our own copy (scripts/copy-maplibre-worker.mjs).
          maplibregl.setWorkerUrl('/map/maplibre-gl-worker.mjs');
          protocolRegistered = true;
        }
        if (cancelled || !container.current) return;

        const projection = createProjection(rt.world.meta.bounds);
        projectionRef.current = projection;
        const start = projection.toLatLng(rt.car.x, rt.car.z);

        // The map is framed by the *playable* neighbourhood, not the wider
        // extraction rectangle and certainly not the old 10 km district. The
        // corners come from the same projection as the 3D world.
        const playable = rt.world.meta.playable;
        const frameOf = (corners: { x: number; z: number }[]) => {
          const lngs = corners.map((c) => projection.toLatLng(c.x, c.z).lng);
          const lats = corners.map((c) => projection.toLatLng(c.x, c.z).lat);
          return [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ] as [[number, number], [number, number]];
        };
        const playableBox = playable
          ? frameOf([
              { x: playable.world.minX, z: playable.world.minZ },
              { x: playable.world.maxX, z: playable.world.maxZ },
            ])
          : frameOf([
              { x: rt.world.meta.worldBounds.minX, z: rt.world.meta.worldBounds.minZ },
              { x: rt.world.meta.worldBounds.maxX, z: rt.world.meta.worldBounds.maxZ },
            ]);
        // Enough room to let a wide, shallow minimap fit the whole playable
        // box without MapLibre clamping the zoom, but far short of the old
        // district view.
        const pad = playable ? 430 : 40; // world metres of breathing room
        const maxBox = playable
          ? frameOf([
              { x: playable.world.minX - pad, z: playable.world.minZ - pad },
              { x: playable.world.maxX + pad, z: playable.world.maxZ + pad },
            ])
          : playableBox;

        const map = new maplibregl.Map({
          container: container.current,
          style: buildMapStyle(),
          center: [start.lng, start.lat],
          zoom: 16,
          minZoom: playable ? 14.6 : 12,
          maxZoom: 18,
          maxBounds: maxBox,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

        map.on('error', (event) => {
          // Every map error is worth surfacing: a swallowed worker or tile
          // failure is exactly what leaves the panel on "Loading street data…".
          const message = String(event.error?.message ?? 'Map tiles failed to load');
          setError(message);
        });

        // Dev-only handle so the map can be inspected from the console.
        if (process.env.NODE_ENV !== 'production') {
          (window as unknown as { __lagosMap?: unknown }).__lagosMap = map;
        }

        // `load` only fires once every source has finished its first pass; a
        // single slow or blocked tile range keeps the panel on "Loading street
        // data…" for as long as the request hangs. `style.load` fires as soon as
        // the style document is parsed, which is the real readiness signal for
        // adding our own overlays. `load`/`idle` still clear the status.
        map.on('style.load', () => {
          if (cancelled) return;
          setLoaded(true);
          map.fitBounds(playableBox, { padding: 22, duration: 0 });

          // --- curated drivable network -----------------------------
          // The 3D world uses a curated subset of OSM (no footways, no dead-end
          // service stubs). Draw exactly that subset so the map never invites
          // the driver down a road the collision/graph world does not contain.
          map.addSource('drivable', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: rt.world.roads.map((road) => {
                const coordinates: number[][] = [];
                for (let i = 0; i < road.pts.length; i += 2) {
                  const p = projection.toLatLng(road.pts[i], road.pts[i + 1]);
                  coordinates.push([p.lng, p.lat]);
                }
                return {
                  type: 'Feature' as const,
                  geometry: { type: 'LineString' as const, coordinates },
                  properties: { cls: road.cls, name: road.name },
                };
              }),
            },
          });
          map.addLayer({
            id: 'drivable-line',
            type: 'line',
            source: 'drivable',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#9fb3a4',
              'line-width': ['interpolate', ['linear'], ['zoom'], 14.5, 0.8, 16.5, 2.4, 18, 4],
              'line-opacity': 0.38,
            },
          });

          // --- stations ---------------------------------------------
          const stations: StationData[] = rt.stations;
          map.addSource('stations', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: stations.map((s) => {
                const lngLat = projection.toLatLng(s.x, s.z);
                const dest = destinationByZone(s.zone);
                return {
                  type: 'Feature' as const,
                  geometry: { type: 'Point' as const, coordinates: [lngLat.lng, lngLat.lat] },
                  properties: { zone: s.zone, label: dest?.label ?? s.label, color: dest?.color ?? '#d8f851' },
                };
              }),
            },
          });
          map.addLayer({
            id: 'stations-halo',
            type: 'circle',
            source: 'stations',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 11],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.16,
            },
          });
          map.addLayer({
            id: 'stations-dot',
            type: 'circle',
            source: 'stations',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.4, 16, 5],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': '#08100f',
              'circle-stroke-width': 1.2,
            },
          });
          map.addLayer({
            id: 'stations-label',
            type: 'symbol',
            source: 'stations',
            minzoom: 12.5,
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Medium'],
              'text-size': 11,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
            },
            paint: { 'text-color': '#e6efe8', 'text-halo-color': '#060d0e', 'text-halo-width': 1.4 },
          });
          map.on('click', 'stations-dot', (event) => {
            const zone = event.features?.[0]?.properties?.zone;
            if (typeof zone === 'string') openDestination(zone);
          });
          map.on('mouseenter', 'stations-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', 'stations-dot', () => { map.getCanvas().style.cursor = ''; });

          // --- route ------------------------------------------------
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
          });
          map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#0a1512', 'line-width': 7, 'line-opacity': 0.75 },
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#d8f851', 'line-width': 3, 'line-opacity': 0.95 },
          });

          // --- vehicle ----------------------------------------------
          const el = document.createElement('div');
          el.className = 'map-vehicle';
          const arrow = document.createElement('div');
          arrow.className = 'map-vehicle__arrow';
          arrow.textContent = '▲';
          el.appendChild(arrow);
          arrowRef.current = arrow;
          markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([start.lng, start.lat])
            .addTo(map);

          setStyleReady(true);
        });

        map.on('load', () => {
          if (!cancelled) setLoaded(true);
        });
      } catch (err) {
        setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setLoaded(false);
      setStyleReady(false);
    };
  }, [mapOpen, rt]);

  // Keep the map the same size as its panel when expanding/collapsing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.resize(), 240);
    return () => window.clearTimeout(id);
  }, [mapExpanded]);

  // Vehicle marker + route follow the simulation (10 Hz, not 60).
  useTelemetry();
  const updateOverlays = useCallback(() => {
    const map = mapRef.current;
    const projection = projectionRef.current;
    const car = runtime.current?.car;
    if (!map || !projection || !car || !styleReady) return;
    const lngLat = projection.toLatLng(car.x, car.z);
    markerRef.current?.setLngLat([lngLat.lng, lngLat.lat]);
    if (arrowRef.current) arrowRef.current.style.transform = `rotate(${(car.yaw * 180) / Math.PI}deg)`;

    const route = runtime.current?.route ?? null;
    const source = map.getSource('route') as unknown as { setData?: (d: unknown) => void } | undefined;
    if (source?.setData) {
      const coords: number[][] = [];
      if (route) {
        for (let i = 0; i < route.length; i += 2) {
          const p = projection.toLatLng(route[i], route[i + 1]);
          coords.push([p.lng, p.lat]);
        }
      }
      source.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    }
  }, [styleReady]);

  useEffect(() => {
    const id = window.setInterval(updateOverlays, 140);
    return () => window.clearInterval(id);
  }, [updateOverlays]);

  useEffect(() => {
    updateOverlays();
  }, [autopilot, updateOverlays]);

  const recenter = () => {
    const map = mapRef.current;
    const projection = projectionRef.current;
    const car = runtime.current?.car;
    if (!map || !projection || !car) return;
    const lngLat = projection.toLatLng(car.x, car.z);
    map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: Math.max(map.getZoom(), 15), duration: 650 });
  };

  if (!mapOpen) return null;

  return (
    <section className="map-panel" data-expanded={mapExpanded} aria-label="Lagos map">
      <header className="map-panel__bar">
        <p>
          <span className="map-panel__dot" /> Lagos Island · Glover / Oshodi
        </p>
        <div className="map-panel__actions">
          <button onClick={recenter} title="Centre on the car" aria-label="Centre on the car">◎</button>
          <button onClick={() => setUi({ mapExpanded: !mapExpanded })} aria-label={mapExpanded ? 'Shrink map' : 'Expand map'}>
            {mapExpanded ? '⤡' : '⤢'}
          </button>
          <button onClick={() => setUi({ mapOpen: false })} aria-label="Close map">✕</button>
        </div>
      </header>
      <div className="map-panel__canvas" ref={container} />
      {!loaded && !error && <div className="map-panel__status">Loading street data…</div>}
      {error && (
        <div className="map-panel__status map-panel__status--error">
          <p>Map unavailable.</p>
          <span>{error}</span>
          <button className="world-button" onClick={() => { setError(null); setUi({ mapOpen: false }); window.setTimeout(() => setUi({ mapOpen: true }), 60); }}>
            Retry
          </button>
        </div>
      )}
      <footer className="map-panel__foot">
        © OpenStreetMap contributors (ODbL) · © OpenMapTiles · neighbourhood tiles built locally from the 2026-10-15 extract
      </footer>
    </section>
  );
}

