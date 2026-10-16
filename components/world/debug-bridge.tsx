'use client';

/**
 * Debug-only inspection bridge. Mounted inside the R3F canvas **only when the URL
 * carries `?debug`** (see world-scene.tsx). It exposes the live three.js scene,
 * camera, renderer, the active layout and the physics world on `window.__world`,
 * and can drive a fixed inspection camera from `window.__camPose` (a 6-number
 * `[px,py,pz,tx,ty,tz]` array) so automated screenshots can frame exact views.
 *
 * None of this runs on the shipping site: without `?debug` the component is never
 * rendered and no globals are created.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { vehicle as vehicleState } from './store';
import type { World } from './physics';
import type { WorldLayout } from './world-layout';

type DebugGlobal = {
  scene: unknown;
  camera: unknown;
  gl: unknown;
  layout: WorldLayout;
  physics: World;
  vehicle: typeof vehicleState;
  ready: boolean;
};

export function DebugBridge({ layout, physics }: { layout: WorldLayout; physics: World }) {
  const { scene, camera, gl } = useThree();
  useEffect(() => {
    const target = window as unknown as Record<string, unknown>;
    const prev = target.__world as DebugGlobal | undefined;
    target.__world = { scene, camera, gl, layout, physics, vehicle: vehicleState, ready: true } satisfies DebugGlobal;
    return () => {
      if (prev) target.__world = prev;
      else delete target.__world;
    };
  }, [scene, camera, gl, layout, physics]);
  return null;
}

export function DebugCamera({ pose }: { pose: number[] }) {
  const { camera } = useThree();
  const initial = useRef(pose);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__camPose = pose;
    return () => { delete (window as unknown as Record<string, unknown>).__camPose; };
  }, [pose]);
  useFrame(() => {
    const target = window as unknown as Record<string, unknown>;
    const p = (target.__camPose as number[] | undefined) ?? initial.current;
    if (!p || p.length !== 6) return;
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(p[3], p[4], p[5]);
  });
  return null;
}
