'use client';

import { districts, works } from '@/lib/works';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Journey } from '@/components/journey/journey';
import { createCollisionGrid } from '@/lib/world/collision';
import { createCar } from '@/lib/world/vehicle';
import {
  clearProjectPlots,
  placeProjectBuildings,
  projectCollisionFootprints,
  type ProjectBuilding,
} from '@/lib/world/project-buildings';
import { buildFurniture, buildPropColliders, buildStreetLights } from '@/lib/world/props';
import { hydrateGraph } from '@/lib/geo/graph';
import { loadBuildingChunk, loadWorld } from '@/lib/world/data';
import type { Building, WorldData } from '@/lib/world/types';
import type { RouteGraph } from '@/lib/geo/graph';
import { Scene } from './scene';
import { Hud } from './hud';
import { runtime, setUi, setTelemetry } from './store';

type Loaded = {
  world: WorldData;
  chunks: { row: number; col: number; buildings: Building[] }[];
  water: number[][];
  grid: ReturnType<typeof createCollisionGrid>;
  graph: RouteGraph;
  projects: ProjectBuilding[];
  lights: number[][];
  furniture: ReturnType<typeof buildFurniture>;
  cleared: number;
};

export function WorldScene() {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Starting the world…');
  const [attempt, setAttempt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const ok = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
      setWebgl(ok);
    } catch {
      setWebgl(false);
    }
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError(null);
    setData(null);
    setStatus('Reading the OpenStreetMap extract…');

    (async () => {
      try {
        const bundle = await loadWorld(controller.signal);
        if (cancelled) return;
        const { world, graph, provenance } = bundle;
        const meta = world.meta;
        setStatus(`Loading ${meta.chunks * meta.chunks} building bundles…`);

        const coords: { row: number; col: number }[] = [];
        for (let row = 0; row < meta.chunks; row++) {
          for (let col = 0; col < meta.chunks; col++) coords.push({ row, col });
        }
        const results = await Promise.allSettled(coords.map((c) => loadBuildingChunk(c.row, c.col)));
        if (cancelled) return;

        const chunks = results
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => ({ row: c.row, col: c.col, buildings: c.b }));

        const failed = results.filter((r) => r.status === 'rejected').length;
        setStatus('Building collision geometry…');

        const water = await fetch('/data/lagos-water.json')
          .then((r) => (r.ok ? r.json() : null))
          .then((payload: { polygons?: number[][] } | null) => payload?.polygons ?? [])
          .catch(() => []);

        if (cancelled) return;

        // --- the nine addresses on the main street ---------------------
        // Their plots are chosen against the surveyed footprints, then those
        // footprints are removed from the render *and* the collision grid, so
        // a designed building never overlaps a surveyed one or the road.
        const allFootprints = chunks.flatMap((c) => c.buildings.map((b) => b.p));
        const roadHalfWidth = Math.max(
          6,
          ...world.stations.map((s) => (s.roadWidth ?? 12) / 2)
        );
        const projects = placeProjectBuildings(world.stations, allFootprints, {
          roadHalfWidth,
          playable: meta.playable?.world ?? meta.worldBounds,
          roads: world.roads
            .filter((r) => !r.tunnel)
            .map((r) => ({ pts: r.pts, halfWidth: Math.max(2, (r.width ?? 6) / 2) })),
          colors: Object.fromEntries(districts.map((d) => [d.id, d.color])),
        });
        const cleared = clearProjectPlots(allFootprints, projects);
        const kept = new Set(cleared.footprints);
        const filteredChunks = chunks.map((c) => ({
          ...c,
          buildings: c.buildings.filter((b) => kept.has(b.p)),
        }));

        const lights = buildStreetLights(world.roads, world.lights);
        const furniture = buildFurniture(world.roads, world.stations).filter(
          (f) => !world.stations.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 18)
        );
        const grid = createCollisionGrid([
          ...cleared.footprints,
          ...projectCollisionFootprints(projects),
          ...buildPropColliders(furniture, lights, world.signals ?? []),
        ]);
        if (process.env.NODE_ENV !== 'production') {
          (window as unknown as { __lagosProjects?: unknown }).__lagosProjects = projects;
        }
        const hydrated = hydrateGraph(graph);
        const spawn = world.spawn ?? { x: 0, z: 0, yaw: 0, nodeIndex: 0, node: 0, road: null };

        runtime.current = {
          world,
          graph,
          provenance,
          stations: world.stations,
          car: createCar(spawn),
          route: null,
          routeId: 0,
        };
        if (process.env.NODE_ENV !== 'production' || window.location.search.includes('debug')) {
          (window as unknown as { __lagosRuntime?: unknown }).__lagosRuntime = runtime;
        }
        setTelemetry({ x: spawn.x, z: spawn.z, yaw: spawn.yaw, road: spawn.road, speed: 0, gear: 'N' });

        setData({
          world,
          chunks: filteredChunks,
          water,
          grid,
          graph: hydrated,
          projects,
          lights,
          furniture,
          cleared: cleared.removed,
        });
        setUi({ phase: 'ready', loadingLabel: 'Ready' });
        if (failed > 0) {
          setStatus(`${failed} building bundle${failed > 1 ? 's' : ''} failed to load — collision is incomplete.`);
        }
      } catch (err) {
        if (cancelled) return;
        const message = (err as Error).message || 'The world could not be loaded.';
        setError(message);
        setUi({ phase: 'error', error: message });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      runtime.current = null;
    };
  }, [attempt]);

  // No WebGL, or the map data failed: the scroll journey tells the same story.
  if (webgl === false) return <Journey />;
  if (error) {
    return (
      <>
        <p className="fallback__banner" role="alert">
          The map could not load. You are seeing the scroll version instead.
          <button onClick={() => setAttempt((n) => n + 1)}>Try the map again</button>
        </p>
        <Journey />
      </>
    );
  }

  if (!data) {
    return (
      <main className="masthead">
        <div className="boot" role="status" aria-live="polite">
          <div className="boot__mark">ABDULSOBUR</div>
          <h1>Loading the street map…</h1>
          <p className="boot__status">{status}</p>
          <div className="boot__bar"><span /></div>
          <p className="boot__note">
            Streets and building shapes come from OpenStreetMap. Prefer a plain list? <Link href="/work">Open it here</Link>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="world">
      <Canvas
        className="world__canvas"
        shadows="soft"
        dpr={[1, 1.7]}
        camera={{ position: [0, 4, 12], fov: 54, near: 0.4, far: 14000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.98;
          gl.shadowMap.type = THREE.PCFShadowMap;
          scene.environmentIntensity = 0.62;
          if (process.env.NODE_ENV !== 'production') {
            (window as unknown as { __lagos3d?: unknown }).__lagos3d = { gl, scene, camera };
          }
        }}
      >
        <Scene
          world={data.world}
          chunks={data.chunks}
          water={data.water}
          grid={data.grid}
          graph={data.graph}
          projects={data.projects}
          lights={data.lights}
          furniture={data.furniture}
          reducedMotion={reducedMotion}
        />
      </Canvas>
      <Hud graph={data.graph} />
      <PortfolioList />
    </div>
  );
}

/** Always-present list of the work for search engines and screen readers. */
function PortfolioList() {
  return (
    <section id="portfolio-fallback" className="portfolio-list sr-only" aria-label="All work">
      <h2>Work</h2>
      <ul>
        {works.map((w) => (
          <li key={w.slug}>
            <Link href={`/work/${w.slug}`}>
              <strong>{w.title}</strong> <small>{w.kind}. {w.line}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
