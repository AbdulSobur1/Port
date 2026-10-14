'use client';

/**
 * The photoreal layer of the world. Everything here is additive: the procedural
 * base city (city.tsx) always renders underneath, and this layer lays CC0 PBR
 * materials, real glTF props and an HDRI environment on top once the assets
 * arrive. Nothing here suspends the base world — the loaders in `assets.ts`
 * push a re-render when each resource is ready.
 *
 * Placement is deliberately conservative: static props are only placed in the
 * arrival hub, at hand-checked positions that sit clear of every road and
 * collider (physics is untouched by this layer). The other three cities get the
 * real street lamps — placed on the existing, collision-safe `lampPositions`.
 */

import * as THREE from 'three';
import { Suspense, useEffect, useMemo } from 'react';
import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  WORLD_ASSETS_ENABLED,
  environmentForHour,
  useMaterial,
  useModel,
  type ModelId,
} from './assets';
import type { WorldLayout } from './world-layout';
import { Glow } from './atmosphere';

/* --------------------------------------------------------------- utilities -- */

/** Scale a geometry's UVs so a shared, repeat-1 material tiles at a fixed real scale. */
function tileUV(geometry: THREE.BufferGeometry, sx: number, sy: number) {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return geometry;
}

/**
 * A box whose UVs are scaled to the building size so a single shared facade
 * material tiles at a roughly constant real-world scale across every building
 * (one texture set for the whole city, regardless of how many blocks there are).
 */
function useTiledBox(w: number, h: number, d: number, tile = 2.4) {
  return useMemo(
    () => tileUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) / tile, h / (tile * 0.9)),
    [w, h, d, tile]
  );
}

/** A ground plane with UVs scaled to a fixed real-world tile size. */
function useTiledPlane(w: number, h: number, tile: number) {
  return useMemo(() => tileUV(new THREE.PlaneGeometry(w, h), w / tile, h / tile), [w, h, tile]);
}

/* ------------------------------------------------------------ environment --- */

function EnvironmentLight({ hour, lowPower }: { hour: number; lowPower: boolean }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    scene.environmentIntensity = 0.55;
    return () => { scene.environmentIntensity = previous; };
  }, [scene]);
  if (lowPower) return null;
  return (
    <Suspense fallback={null}>
      <Environment files={environmentForHour(hour)} background={false} />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ floor --- */

const ROAD_TILE = 4.5;

function AsphaltRoad({ w, h, position }: { w: number; h: number; position: [number, number, number] }) {
  const asphalt = useMaterial('asphalt', 1);
  const geometry = useTiledPlane(w, h, ROAD_TILE);
  if (!asphalt) return null;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} geometry={geometry} material={asphalt} />;
}

/** PBR road + pavement planes laid just above the procedural floor. */
function TexturedGround({ world }: { world: WorldLayout }) {
  const pavement = useMaterial('pavement', 1);
  const pavementGeometry = useTiledPlane(64, 64, 3.2);
  if (!pavement) return null;

  const base = (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.082, 0]} geometry={pavementGeometry} material={pavement} />
  );

  if (world.id === 'hub') {
    const lanes = [
      { at: 0, w: 5.5 },
      { at: -9.1, w: 3.2 },
      { at: 9.1, w: 3.2 },
    ];
    return (
      <group>
        {base}
        {lanes.map((lane) => <AsphaltRoad key={`rx-${lane.at}`} w={lane.w} h={48} position={[lane.at, -0.071, 0]} />)}
        {lanes.map((lane) => <AsphaltRoad key={`rz-${lane.at}`} w={48} h={lane.w} position={[0, -0.071, lane.at]} />)}
      </group>
    );
  }

  const radius = world.landmark ? world.landmark.radius + 2.2 : 4;
  return (
    <group>
      {base}
      <AsphaltRoad w={6} h={64} position={[0, -0.071, 0]} />
      <RingRoad radius={radius} />
    </group>
  );
}

/** A shared-tile asphalt ring (roundabout) for the district cities. */
function RingRoad({ radius }: { radius: number }) {
  const asphalt = useMaterial('asphalt', 1);
  const geometry = useMemo(
    () => tileUV(new THREE.RingGeometry(radius, radius + 5.6, 128), (radius + 5.6) / 2.25, (radius + 5.6) / 2.25),
    [radius]
  );
  if (!asphalt) return null;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.066, 0]} geometry={geometry} material={asphalt} />;
}

/* ---------------------------------------------------------------- facades --- */

function BuildingSkin({ x, z, w, d, h, material }: { x: number; z: number; w: number; d: number; h: number; material: THREE.Material }) {
  const geometry = useTiledBox(w + 0.012, h, d + 0.012);
  return <mesh geometry={geometry} position={[x, h / 2 + 0.35, z]} material={material} />;
}

function BuildingSkins({ world }: { world: WorldLayout }) {
  const facade = useMaterial('facade', 1);
  if (!facade) return null;
  return (
    <group>
      {world.buildings.map((b) => (
        <BuildingSkin key={`skin-${b.x}-${b.z}`} x={b.x} z={b.z} w={b.w} d={b.d} h={b.h} material={facade} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ props --- */

export function Prop({ id, x, z, yaw = 0, scale = 1 }: { id: ModelId; x: number; z: number; yaw?: number; scale?: number }) {
  const template = useModel(id);
  const object = useMemo(() => (template ? template.clone(true) : null), [template]);
  if (!object) return null;
  return <primitive object={object} position={[x, 0, z]} rotation={[0, yaw, 0]} scale={scale} />;
}

/** Real street lamps on the collision-safe lamp positions, with a warm halo. */
function StreetLamps({ world }: { world: WorldLayout }) {
  const lit = useModel('streetLamp');
  if (!lit) return null;
  return (
    <group>
      {world.lampPositions.map(([x, z], i) => (
        <Prop key={`lamp-${x}-${z}`} id="streetLamp" x={x} z={z} yaw={i % 2 ? Math.PI : 0} />
      ))}
      {world.lampPositions.map(([x, z], i) => (
        <Glow key={`lamp-glow-${x}-${z}`} x={x + (i % 2 ? -0.34 : 0.34)} y={3.35} z={z} color="#ffe6b0" size={1.5} opacity={0.5} />
      ))}
    </group>
  );
}

/**
 * Curated static props for the arrival hub. Every coordinate below was chosen to
 * sit in a free quadrant between the plaza, the four streets and the ring
 * buildings — none overlaps a road, a collider or a station.
 */
function HubProps() {
  const benches: ReadonlyArray<readonly [number, number, number]> = [
    [5.2, 5.2, Math.PI * 0.25], [-5.2, 5.2, -Math.PI * 0.25],
    [-5.2, -5.2, Math.PI * 1.25], [5.2, -5.2, -Math.PI * 1.25],
  ];
  const planters: ReadonlyArray<readonly [number, number]> = [[4.1, 7.1], [-4.1, 7.1], [4.1, -7.1], [-4.1, -7.1]];
  const hydrants: ReadonlyArray<readonly [number, number]> = [[3.5, 12.4], [-3.5, 12.4]];
  const barriers: ReadonlyArray<readonly [number, number]> = [[13.2, 12.6], [-13.2, 12.6]];
  return (
    <group>
      {benches.map(([x, z, yaw]) => <Prop key={`bench-${x}-${z}`} id="bench" x={x} z={z} yaw={yaw} />)}
      {planters.map(([x, z]) => <Prop key={`planter-${x}-${z}`} id="planter" x={x} z={z} yaw={Math.PI * 0.25} />)}
      {hydrants.map(([x, z]) => <Prop key={`hydrant-${x}-${z}`} id="hydrant" x={x} z={z} />)}
      {barriers.map(([x, z]) => <Prop key={`barrier-${x}-${z}`} id="barrier" x={x} z={z} />)}
    </group>
  );
}

/* ------------------------------------------------------------------ layer --- */

export function AssetLayer({ world, lowPower = false }: { world: WorldLayout; lowPower?: boolean }) {
  if (!WORLD_ASSETS_ENABLED) return null;
  return (
    <group>
      <EnvironmentLight hour={world.theme.time} lowPower={lowPower} />
      <TexturedGround world={world} />
      <BuildingSkins world={world} />
      <StreetLamps world={world} />
      {world.id === 'hub' && <HubProps />}
    </group>
  );
}
