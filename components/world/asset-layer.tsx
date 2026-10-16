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

/**
 * The PBR pavement base laid just under the road armature. Road surfaces,
 * junctions and kerbs are owned by the procedural `RoadNetwork` in city.tsx, so
 * this layer adds only the ground texture (no duplicate road planes).
 */
function TexturedGround() {
  const pavement = useMaterial('pavement', 1);
  const pavementGeometry = useTiledPlane(64, 64, 3.2);
  if (!pavement) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.082, 0]} geometry={pavementGeometry} material={pavement} />
  );
}

/* ---------------------------------------------------------------- facades --- */

function BuildingSkin({ x, z, w, d, h, material }: { x: number; z: number; w: number; d: number; h: number; material: THREE.Material }) {
  const geometry = useTiledBox(w + 0.012, h, d + 0.012);
  return <mesh geometry={geometry} position={[x, h / 2 + 0.35, z]} material={material} />;
}

function BuildingSkins({ world }: { world: WorldLayout }) {
  const facade = useMaterial('facade', 1);
  const brick = useMaterial('brick', 1);
  const plaster = useMaterial('plaster', 1);
  const tileFacade = useMaterial('tileFacade', 1);
  const palette = [facade, tileFacade, plaster, brick];
  if (!facade) return null;
  return (
    <group>
      {world.buildings.map((b, i) => (
        <BuildingSkin
          key={`skin-${b.x}-${b.z}`}
          x={b.x}
          z={b.z}
          w={b.w}
          d={b.d}
          h={b.h}
          material={palette[i % palette.length] ?? facade}
        />
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

/**
 * Garden furniture cluster (painted benches + planters) for the green districts.
 * Like every prop in this layer it is purely decorative and adds no collider.
 */
function GardenCluster({ x, z }: { x: number; z: number }) {
  const cobble = useMaterial('cobble', 3);
  const path = useMaterial('brickPath', 6);
  const benches: ReadonlyArray<readonly [number, number, number]> = [
    [-2.2, 0, Math.PI / 2],
    [2.2, 0, -Math.PI / 2],
  ];
  const planters: ReadonlyArray<readonly [number, number]> = [
    [0, -2.6],
    [0, 2.6],
    [-2.8, 2.8],
    [2.8, -2.8],
  ];
  return (
    <group position={[x, 0, z]}>
      {cobble && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.072, 0]} receiveShadow>
          <circleGeometry args={[4.6, 48]} />
          <primitive object={cobble} attach="material" />
        </mesh>
      )}
      {path && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
          <planeGeometry args={[1.1, 12]} />
          <primitive object={path} attach="material" />
        </mesh>
      )}
      {benches.map(([bx, bz, yaw]) => (
        <Prop key={`gbench-${bx}-${bz}`} id="gardenBench" x={bx} z={bz} yaw={yaw} />
      ))}
      {planters.map(([px, pz]) => (
        <Prop key={`gplanter-${px}-${pz}`} id="planterGarden" x={px} z={pz} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ layer --- */

export function AssetLayer({ world, lowPower = false }: { world: WorldLayout; lowPower?: boolean }) {
  if (!WORLD_ASSETS_ENABLED) return null;
  return (
    <group>
      <EnvironmentLight hour={world.theme.time} lowPower={lowPower} />
      <TexturedGround />
      <BuildingSkins world={world} />
      <StreetLamps world={world} />
      {world.id === 'hub' && <HubProps />}
      {world.id === 'hub' && <GardenCluster x={-15} z={11} />}
      {world.id === 'about' && <GardenCluster x={0} z={-11} />}
    </group>
  );
}
