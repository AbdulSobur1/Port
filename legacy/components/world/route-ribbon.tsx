'use client';

import { useMemo } from 'react';
import { buildRouteRibbon } from '@/lib/world/geometry';
import { runtime, useUi } from './store';
import { toGeometry } from './city';

/**
 * The driven route, drawn on the ground. It reads `runtime.route`, which is
 * written by the same autopilot that steers the car, so the line can never
 * show a different path from the one being followed.
 */
export function RouteRibbon() {
  const { autopilot } = useUi();
  const route = runtime.current?.route ?? null;
  const routeId = runtime.current?.routeId ?? 0;
  const status = autopilot?.status ?? 'none';

  const geometry = useMemo(() => {
    if (!route || route.length < 4) return null;
    return toGeometry(buildRouteRibbon(route, 1.6));
  }, [routeId, status, route]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
