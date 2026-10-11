'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import { World } from './city';
import { ChaseCamera } from './chase-camera';
import { Simulation } from './simulation';
import { Hud } from './hud';
import { setUi } from './store';
import { projects } from '@/lib/projects';
import Link from 'next/link';

export function WorldScene() {
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const test = document.createElement('canvas');
      setWebgl(Boolean(test.getContext('webgl2') || test.getContext('webgl')));
    } catch {
      setWebgl(false);
    }
  }, []);

  if (webgl === false) {
    return (
      <div className="world-fallback">
        <p className="case-label">SOBURR / PORTFOLIO INDEX</p>
        <h1>The interactive world needs WebGL.</h1>
        <p>A plain listing of the same records:</p>
        <ul>
          {projects.map((project) => (
            <li key={project.slug}><Link href={`/work/${project.slug}`}>{project.number} / {project.title}</Link></li>
          ))}
        </ul>
        <a className="case-button" href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
      </div>
    );
  }

  return (
    <div className="world-experience">
      {webgl !== null && (
        <Canvas
          className="world-canvas"
          camera={{ position: [0, 5.4, 24], fov: 50 }}
          dpr={[1, 1.5]}
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#09100f']} />
          <Suspense fallback={null}>
            <World />
            <ChaseCamera active /><Simulation />
          </Suspense>
        </Canvas>
      )}
      <div className="world-grain" />
      <Hud />
    </div>
  );
}
