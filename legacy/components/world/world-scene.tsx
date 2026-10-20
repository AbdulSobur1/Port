'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { projects } from '@/lib/projects';
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
        console.log('[world] bundle loaded', bundle.world.meta.chunks);
        if (cancelled) return;
        const { world, graph, provenance } = bundle;
        const meta = world.meta;
        setStatus(`Loading ${meta.chunks * meta.chunks} building bundles…`);

        const coords: { row: number; col: number }[] = [];
        for (let row = 0; row < meta.chunks; row++) {
          for (let col = 0; col < meta.chunks; col++) coords.push({ row, col });
        }
        console.log('[world] requesting chunks', coords.length);
        const results = await Promise.allSettled(coords.map((c) => loadBuildingChunk(c.row, c.col)));
        console.log('[world] chunks settled', results.length);
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
        console.log(
          `[world] project buildings ${projects.length}, cleared ${cleared.removed} surveyed footprints, colliders ${grid.count}`
        );
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
        if (process.env.NODE_ENV !== 'production') {
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

  const fallback = useMemo(() => <PortfolioList />, []);

  if (webgl === false) {
    return (
      <Masthead>
        <div className="fallback">
          <p className="eyebrow">Soburr / portfolio index</p>
          <h1>This world needs WebGL.</h1>
          <p>The drivable city cannot run in this browser, but every project record is still here.</p>
          <PortfolioList visible />
        </div>
      </Masthead>
    );
  }

  if (error) {
    return (
      <Masthead>
        <div className="fallback">
          <p className="eyebrow">Signal lost</p>
          <h1>The Lagos dataset did not load.</h1>
          <p className="fallback__error">{error}</p>
          <p>
            The world is a static build of OpenStreetMap geometry served from this domain — a network or
            storage failure blocks the drive but not the work.
          </p>
          <div className="fallback__actions">
            <button className="world-button world-button--primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
            <Link className="world-button" href="/work/proofmesh">Open a case record</Link>
          </div>
          <PortfolioList visible />
        </div>
      </Masthead>
    );
  }

  if (!data) {
    return (
      <Masthead>
        <div className="boot" role="status" aria-live="polite">
          <div className="boot__mark">SOBURR</div>
          <h1>Lagos Island, at street scale.</h1>
          <p className="boot__status">{status}</p>
          <div className="boot__bar"><span /></div>
          <p className="boot__note">
            Real streets and building footprints from OpenStreetMap (ODbL), curated to a 560 m playable
            neighbourhood around Glover and Oshodi streets. The national extract is processed locally and never shipped.
          </p>
        </div>
        {fallback}
      </Masthead>
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

function Masthead({ children }: { children: React.ReactNode }) {
  return (
    <main className="masthead">
      <header className="masthead__bar">
        <span className="hud-brand__mark">SOBURR</span>
        <span className="hud-brand__sub">Lagos Island / Glover</span>
      </header>
      {children}
      <footer className="masthead__foot">
        Data © OpenStreetMap contributors (ODbL) · Tiles generated locally from the 2026-10-15 Geofabrik Nigeria extract
      </footer>
    </main>
  );
}

/** Always-present, keyboard-reachable list of the portfolio (SEO + no-WebGL + a11y). */
function PortfolioList({ visible = false }: { visible?: boolean }) {
  return (
    <section
      id="portfolio-fallback"
      className={visible ? 'portfolio-list portfolio-list--visible' : 'portfolio-list sr-only'}
      aria-label="Portfolio index"
    >
      <h2>Work</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.slug}>
            <Link href={`/work/${project.slug}`}>
              <span>{project.number}</span>
              <strong>{project.title}</strong>
              <small>{project.category}</small>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <a href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
      </p>
    </section>
  );
}
