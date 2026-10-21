'use client';

import { useMemo } from 'react';
import type { CollisionGrid } from '@/lib/world/collision';
import type { RouteGraph } from '@/lib/geo/graph';
import type { Building, StationData, WorldData } from '@/lib/world/types';
import { SceneEnvironment } from './environment';
import { Ground, Parks, WaterSurface, WorldEdge } from './terrain';
import { Buildings, MainStreetMarkings, Roads, StreetFurniture, StreetLights, TrafficSignals, Trees } from './city';
import type { Furniture } from '@/lib/world/props';
import type { ProjectBuilding } from '@/lib/world/project-buildings';
import { ProjectBuildings } from './project-buildings';
import { Pedestrians } from './pedestrians';
import { buildPopulation } from '@/lib/world/pedestrians';
import { PlayerCar } from './car';
import { ChaseCamera } from './chase-camera';
import { Simulation } from './simulation';
import { RouteRibbon } from './route-ribbon';
import { getUi, openDestination, runtime } from './store';

export function Scene({
  world,
  chunks,
  water,
  grid,
  graph,
  projects,
  lights,
  furniture,
  reducedMotion,
}: {
  world: WorldData;
  chunks: { row: number; col: number; buildings: Building[] }[];
  water: number[][];
  grid: CollisionGrid;
  graph: RouteGraph;
  projects: ProjectBuilding[];
  lights: number[][];
  furniture: Furniture[];
  reducedMotion: boolean;
}) {
  const buildings = useMemo(() => chunks, [chunks]);
  const green = useMemo(() => world.green ?? [], [world.green]);
  const waterPolys = useMemo(() => (water.length ? water : world.water), [water, world.water]);
  const population = useMemo(
    () =>
      buildPopulation({
        roads: world.roads,
        stations: world.stations,
        furniture,
        crossings: world.crossings ?? [],
        walkers: 120,
      }),
    [world.roads, world.stations, world.crossings, furniture]
  );

  return (
    <>
      <SceneEnvironment />
      <ChaseCamera reducedMotion={reducedMotion} />
      <Simulation
        grid={grid}
        bounds={world.meta.worldBounds}
        graph={graph}
        stations={world.stations}
      />

      <Ground size={world.meta.size} />
      <WaterSurface polygons={waterPolys} />
      <Parks polygons={green} />
      <Roads roads={world.roads} crossings={world.crossings ?? []} mainStreet={world.mainStreet?.name} />
      {world.mainStreet && <MainStreetMarkings p={world.mainStreet.p} />}
      <Buildings chunks={buildings} meta={world.meta} />
      <Trees trees={world.trees} />
      <StreetLights lights={lights} />
      <StreetFurniture items={furniture} />
      <TrafficSignals signals={world.signals} />
      <WorldEdge bounds={world.meta.worldBounds} />

      <ProjectBuildings buildings={projects} onSelect={openDestination} />
      <Pedestrians population={population} />
      <PlayerCar />
      <RouteRibbon />
    </>
  );
}

/** Convenience for the HUD: the station the car is currently parked at. */
export function currentStation(): StationData | null {
  const rt = runtime.current;
  const zone = getUi().nearby;
  if (!rt || !zone) return null;
  return rt.stations.find((s) => s.zone === zone) ?? null;
}
