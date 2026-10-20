'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  stepPedestrians,
  type Pedestrian,
  type PedestrianPositions,
  type Population,
} from '@/lib/world/pedestrians';
import { runtime } from './store';

const SHIRTS = ['#cdd5ce', '#c98f5a', '#4d6b73', '#a34a3f', '#d9c05c', '#58684f', '#8a7fa6', '#e0e4dd'];
const SKIN = ['#4a2f22', '#6b4530', '#8a5c3f', '#3a2419', '#a06f4e'];
const TROUSERS = ['#20282a', '#2f3a3f', '#3a332c', '#1a2022'];

function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/**
 * Instanced crowd.
 *
 * Four draw calls for the whole population: torso, head, legs and arms. Each
 * agent gets a deterministic shirt/skin/trouser colour and a gait phase, so the
 * street does not read as clones. Sitters collapse their legs and sit lower;
 * idlers face the car when it comes close.
 */
export function Pedestrians({ population }: { population: Population }) {
  const positions = useRef<PedestrianPositions>([]);
  const torso = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsetMatrix = useMemo(() => new THREE.Matrix4(), []);
  const people = population.people;
  const count = people.length;

  useLayoutEffect(() => {
    const t = torso.current;
    const h = head.current;
    const l = legs.current;
    const a = arms.current;
    if (!t || !h || !l || !a) return;
    const shirts = new THREE.Color();
    const skins = new THREE.Color();
    const trousers = new THREE.Color();
    people.forEach((p, i) => {
      t.setColorAt(i, shirts.set(SHIRTS[Math.floor(hash(p.id * 3 + 1) * SHIRTS.length)]));
      h.setColorAt(i, skins.set(SKIN[Math.floor(hash(p.id * 5 + 2) * SKIN.length)]));
      const trouser = trousers.set(TROUSERS[Math.floor(hash(p.id * 7 + 3) * TROUSERS.length)]);
      l.setColorAt(i * 2, trouser);
      l.setColorAt(i * 2 + 1, trouser);
      a.setColorAt(i * 2, shirts);
      a.setColorAt(i * 2 + 1, shirts);
    });
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    if (l.instanceColor) l.instanceColor.needsUpdate = true;
    if (a.instanceColor) a.instanceColor.needsUpdate = true;
  }, [people]);

  useFrame((_, dtRaw) => {
    const car = runtime.current?.car;
    if (!car) return;
    const dt = Math.min(0.06, dtRaw);
    const out = positions.current;
    stepPedestrians(population, people, dt, car, out);
    if (runtime.current) runtime.current.pedestrians = out;

    const t = torso.current;
    const h = head.current;
    const l = legs.current;
    const a = arms.current;
    if (!t || !h || !l || !a) return;

    for (let i = 0; i < people.length; i++) {
      const p: Pedestrian = people[i];
      const scale = 0.94 + hash(p.id * 11 + 5) * 0.12;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const toWorld = (lx: number, lz: number): [number, number] => [p.x + c * lx + s * lz, p.z - s * lx + c * lz];

      const sitting = p.kind === 'sitter';
      const bodyY = (sitting ? 0.83 : 1.12) * scale;
      const headY = (sitting ? 1.2 : 1.58) * scale;
      const [bx, bz] = toWorld(0, 0);

      dummy.position.set(bx, bodyY, bz);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, scale, 1);
      dummy.updateMatrix();
      t.setMatrixAt(i, dummy.matrix);

      dummy.position.set(bx, headY, bz);
      dummy.updateMatrix();
      h.setMatrixAt(i, dummy.matrix);

      // Gait: legs swing in opposition, arms counter-swing. Idlers sway in
      // place; sitters keep their legs folded.
      const gait = Math.sin(p.phase);
      const swing = sitting ? 0 : (p.kind === 'walker' || p.kind === 'crosser' ? gait * 0.5 : 0);
      const hipY = (sitting ? 0.55 : 0.82) * scale;
      const legLength = 0.82 * scale;

      for (const side of [-1, 1]) {
        const [lx, lz] = toWorld(side * 0.11, 0);
        dummy.position.set(lx, hipY, lz);
        dummy.rotation.set(side * swing, p.yaw, 0);
        dummy.scale.set(1, sitting ? 0.35 : 1, 1);
        dummy.updateMatrix();
        offsetMatrix.makeTranslation(0, -legLength / 2, 0);
        dummy.matrix.multiply(offsetMatrix);
        l.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), dummy.matrix);
      }

      for (const side of [-1, 1]) {
        const [ax, az] = toWorld(side * 0.3, 0);
        dummy.position.set(ax, (sitting ? 1.0 : 1.34) * scale, az);
        dummy.rotation.set(-side * swing * 0.8, p.yaw, side * 0.08);
        dummy.scale.set(1, sitting ? 0.7 : 1, 1);
        dummy.updateMatrix();
        offsetMatrix.makeTranslation(0, -0.24 * scale, 0);
        dummy.matrix.multiply(offsetMatrix);
        a.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), dummy.matrix);
      }
    }

    t.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    l.instanceMatrix.needsUpdate = true;
    a.instanceMatrix.needsUpdate = true;
  });

  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={torso} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.48, 0.62, 0.27]} />
        <meshStandardMaterial roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.115, 10, 8]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[undefined, undefined, count * 2]} frustumCulled={false}>
        <boxGeometry args={[0.145, 0.82, 0.17]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, count * 2]} frustumCulled={false}>
        <boxGeometry args={[0.105, 0.5, 0.13]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
    </group>
  );
}
