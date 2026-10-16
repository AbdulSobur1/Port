'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { World } from './city';
import { ChaseCamera } from './chase-camera';
import { Simulation } from './simulation';
import { Hud } from './hud';
import { AdaptiveQuality } from './adaptive-quality';
import { PerfOverlay, PerfProbe } from './diagnostics';
import { DebugBridge, DebugCamera } from './debug-bridge';
import { useWorldMapTexture } from './map-ground';
import { createWorld, type World as PhysicsWorld } from './physics';
import { getLayout, worldMeta, type WorldId } from './world-cities';
import { resetVehiclePose } from './store';
import { projects } from '@/lib/projects';

export function WorldScene({ worldId = 'hub' }: { worldId?: WorldId }) {
  const router = useRouter();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedQuality, setReducedQuality] = useState(false);
  const [performanceReduced, setPerformanceReduced] = useState(false);
  const [debug, setDebug] = useState(false);
  const [camPose, setCamPose] = useState<number[] | null>(null);
  const lowPower = reducedQuality || performanceReduced;

  const layout = useMemo(() => getLayout(worldId), [worldId]);
  const world = useMemo<PhysicsWorld>(() => createWorld(layout), [layout]);
  const worldMap = useWorldMapTexture(!lowPower);

  // The vehicle is a module-level ref; snap it to this city's spawn on mount/change.
  useEffect(() => {
    resetVehiclePose(world.spawn);
  }, [world]);

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedQuality(coarsePointer || reducedMotion);
    const params = new URLSearchParams(window.location.search);
    setDebug(params.has('debug'));
    const cam = (params.get('cam') ?? '').split(',').map(Number);
    if (cam.length === 6 && cam.every((n) => Number.isFinite(n))) setCamPose(cam);

    try {
      const test = document.createElement('canvas');
      setWebgl(Boolean(test.getContext('webgl2') || test.getContext('webgl')));
    } catch {
      setWebgl(false);
    }
  }, []);

  if (webgl === false) {
    return (
      <main className="world-fallback" id="world-main">
        <p className="case-label">SOBURR / PORTFOLIO INDEX</p>
        <h1>The interactive world needs WebGL.</h1>
        <p>This browser has WebGL disabled, so the 3D world cannot render. The same work is listed below.</p>
        <ul>
          {projects.map((project) => (
            <li key={project.slug}>
              <Link href={`/work/${project.slug}`}>{project.number} / {project.title}</Link>
              {project.links?.demo && <> · <a href={project.links.demo} target="_blank" rel="noreferrer">live demo ↗</a></>}
            </li>
          ))}
        </ul>
        <a className="case-button" href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
      </main>
    );
  }

  return (
    <div className="world-experience">
      <a className="skip-link" href="#world-main">Skip to controls</a>
      {webgl !== null && (
        <Canvas
          key={worldId}
          className="world-canvas"
          camera={{ position: [0, 5.4, 24], fov: 50 }}
          dpr={lowPower ? 0.75 : 1}
          shadows={false}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={[layout.theme.zenith ?? layout.theme.background]} />
          <PerfProbe />
          <AdaptiveQuality
            onDecline={() => { if (!debug) setPerformanceReduced(true); }}
            onIncline={() => setPerformanceReduced(false)}
          />
          <Suspense fallback={null}>
            <World world={layout} lowPower={lowPower} mapTexture={worldMap.texture} />
            {debug && camPose ? <DebugCamera pose={camPose} /> : <ChaseCamera active />}
            <Simulation world={world} onPortal={(href) => router.push(href)} />
          </Suspense>
          {debug && <DebugBridge layout={layout} physics={world} />}
        </Canvas>
      )}
      <div className="world-grain" />
      <Hud world={layout} />
      {worldMap.status === 'ready' && <p className="world-map-credit">{worldMap.attribution}</p>}
      {debug && <PerfOverlay />}
      {debug && <p className="world-debug world-debug--map">map: {worldMap.status}</p>}
      <p className="world-city-tag">{worldMeta[worldId].name} — {worldMeta[worldId].tagline}</p>
    </div>
  );
}