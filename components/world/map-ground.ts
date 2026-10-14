'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { MAP_CANVAS_SIZE, MAP_ZOOM, WORLD_ORIGIN } from './geo';
import { MAP_ATTRIBUTION, mapEnabled, mapStyle } from './map-style';

export type WorldMapStatus = 'disabled' | 'loading' | 'ready' | 'unavailable';

export type WorldMap = {
  /** A live canvas texture of the real map, or `null` while unavailable. */
  texture: THREE.Texture | null;
  status: WorldMapStatus;
  attribution: string;
};

/**
 * Renders a real OpenStreetMap (MapLibre) view centred on `WORLD_ORIGIN` into an
 * offscreen canvas and exposes it as a `THREE.CanvasTexture` for the ground plane.
 *
 * The map is deliberately static: one fixed centre and zoom means the texture never
 * needs to re-project, so the world's coordinate system stays the single source of
 * truth. If MapLibre, the network, or WebGL is unavailable, `status` becomes
 * `'unavailable'` and the caller falls back to the procedural ground — the city is
 * never left without a floor.
 */
export function useWorldMapTexture(enabled: boolean): WorldMap {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [status, setStatus] = useState<WorldMapStatus>(enabled && mapEnabled() ? 'loading' : 'disabled');

  useEffect(() => {
    if (!enabled || !mapEnabled()) {
      setStatus('disabled');
      setTexture(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let map: import('maplibre-gl').Map | null = null;
    let canvasTexture: THREE.CanvasTexture | null = null;
    let container: HTMLDivElement | null = null;

    const teardown = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (map) {
        try {
          map.remove();
        } catch {
          /* already detached */
        }
        map = null;
      }
      if (container?.parentNode) container.parentNode.removeChild(container);
      container = null;
    };

    setStatus('loading');

    void (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (cancelled) return;

        container = document.createElement('div');
        container.setAttribute('aria-hidden', 'true');
        container.style.cssText = `position:fixed;left:-20000px;top:0;width:${MAP_CANVAS_SIZE}px;height:${MAP_CANVAS_SIZE}px;pointer-events:none;`;
        document.body.appendChild(container);

        const instance = new maplibre.Map({
          container,
          style: mapStyle(),
          center: [WORLD_ORIGIN.lng, WORLD_ORIGIN.lat],
          zoom: MAP_ZOOM,
          bearing: 0,
          pitch: 0,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          maxZoom: 22,
          canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
        });
        map = instance;

        // A missing network must not leave the ground loading forever.
        timer = window.setTimeout(() => {
          if (cancelled || canvasTexture) return;
          setStatus('unavailable');
          teardown();
        }, 8000);

        instance.once('idle', () => {
          if (cancelled || canvasTexture || !map) return;
          canvasTexture = new THREE.CanvasTexture(instance.getCanvas());
          canvasTexture.flipY = false; // canvas top = north (see the convention in geo.ts)
          canvasTexture.colorSpace = THREE.SRGBColorSpace;
          canvasTexture.magFilter = THREE.LinearFilter;
          canvasTexture.minFilter = THREE.LinearFilter;
          canvasTexture.generateMipmaps = false;
          canvasTexture.anisotropy = 4;
          // Tiles can still stream in after the first idle; refresh on demand.
          instance.on('render', () => {
            if (canvasTexture) canvasTexture.needsUpdate = true;
          });
          setTexture(canvasTexture);
          setStatus('ready');
        });
      } catch {
        if (!cancelled) setStatus('unavailable');
        teardown();
      }
    })();

    return () => {
      cancelled = true;
      canvasTexture?.dispose();
      teardown();
    };
  }, [enabled]);

  return { texture, status, attribution: MAP_ATTRIBUTION };
}
