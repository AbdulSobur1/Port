'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Building, RoadData, StationData } from '@/lib/world/types';
import { buildBuildingMeshes, buildMainStreetMarkings, buildRoadMeshes, type MeshArrays } from '@/lib/world/geometry';
import { asphaltTexture, concreteTexture, facadeTexture, glassTexture, labelTexture } from './textures';
import { destinationByZone } from '@/lib/world/destinations';
import type { Furniture } from '@/lib/world/props';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function toGeometry(arrays: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

export function Roads({
  roads,
  crossings,
  mainStreet,
}: {
  roads: RoadData[];
  crossings: { x: number; z: number; h: number; w: number }[];
  mainStreet?: string;
}) {
  const meshes = useMemo(() => buildRoadMeshes(roads, crossings, mainStreet), [roads, crossings, mainStreet]);
  const asphalt = useMemo(() => toGeometry(meshes.asphalt), [meshes]);
  const sidewalk = useMemo(() => toGeometry(meshes.sidewalk), [meshes]);
  const curb = useMemo(() => toGeometry(meshes.curb), [meshes]);
  const markings = useMemo(() => toGeometry(meshes.markings), [meshes]);

  const asphaltMap = useMemo(() => asphaltTexture(), []);
  const concreteMap = useMemo(() => concreteTexture(), []);

  return (
    <group>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial map={asphaltMap} vertexColors roughness={0.93} metalness={0.02} envMapIntensity={0.55} />
      </mesh>
      <mesh geometry={sidewalk} receiveShadow>
        <meshStandardMaterial map={concreteMap} vertexColors roughness={0.95} />
      </mesh>
      <mesh geometry={curb} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh geometry={markings} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.65} emissive="#3a3a34" emissiveIntensity={0.12} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

/** The boulevard's centre line, drawn from the mainStreet polyline. */
export function MainStreetMarkings({ p }: { p: number[] }) {
  const geometry = useMemo(() => toGeometry(buildMainStreetMarkings(p)), [p]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.6} emissive="#3a3a34" emissiveIntensity={0.12} polygonOffset polygonOffsetFactor={-3} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

/** Buildings within this radius of the camera are drawn; fog hides the edge. */
const DRAW_RADIUS = 2400;
/** Buildings per mesh. Keeps each geometry allocation small (≈2 MB GPU). */
const BATCH = 900;

/**
 * One batch of extruded footprints.
 *
 * Geometry is built lazily the first time the batch comes within range and is
 * then cached, so walking the camera through a 45,000-building city does not
 * allocate every mesh up front (which is what made the renderer run out of
 * memory). Chunk-level distance culling plus exponential fog is the LOD here:
 * the render mesh never gets simpler, it just stops being drawn where the haze
 * makes it invisible anyway.
 */
function BuildingBatch({ buildings, center }: { buildings: Building[]; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const [wanted, setWanted] = useState(false);
  const [ready, setReady] = useState(false);

  // Defer the build out of the render phase so a batch never blocks the frame.
  useEffect(() => {
    if (!wanted || ready) return;
    const id = window.setTimeout(() => setReady(true), 16);
    return () => window.clearTimeout(id);
  }, [wanted, ready]);

  const geometry = useMemo(() => {
    if (!ready) return null;
    const meshes = buildBuildingMeshes(buildings);
    return {
      walls: toGeometry(meshes.walls),
      glass: toGeometry(meshes.glass),
      trim: toGeometry(meshes.trim),
      roofs: toGeometry(meshes.roofs),
      clutter: toGeometry(meshes.clutter),
    };
  }, [ready, buildings]);

  const facade = useMemo(() => facadeTexture(), []);
  const glass = useMemo(() => glassTexture(), []);
  const concrete = useMemo(() => concreteTexture(), []);

  useFrame(() => {
    const d = Math.hypot(camera.position.x - center.x, camera.position.z - center.z);
    const inRange = d < DRAW_RADIUS;
    if (inRange && !wanted) setWanted(true);
    if (group.current) group.current.visible = inRange && ready;
  });

  if (!geometry) return null;
  return (
    <group ref={group}>
      <mesh geometry={geometry.walls} castShadow receiveShadow frustumCulled>
        <meshStandardMaterial map={facade} vertexColors roughness={0.82} metalness={0.05} envMapIntensity={0.7} />
      </mesh>
      <mesh geometry={geometry.glass} castShadow receiveShadow frustumCulled>
        <meshStandardMaterial map={glass} vertexColors roughness={0.24} metalness={0.62} envMapIntensity={1.45} />
      </mesh>
      <mesh geometry={geometry.trim} castShadow receiveShadow frustumCulled>
        <meshStandardMaterial vertexColors roughness={0.78} metalness={0.08} envMapIntensity={0.65} />
      </mesh>
      <mesh geometry={geometry.roofs} castShadow receiveShadow frustumCulled>
        <meshStandardMaterial map={concrete} vertexColors roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometry.clutter} castShadow receiveShadow frustumCulled>
        <meshStandardMaterial vertexColors roughness={0.88} />
      </mesh>
    </group>
  );
}

type Batch = { key: string; buildings: Building[]; center: { x: number; z: number } };

/** Split every chunk into spatial batches (not just sequential slices). */
function makeBatches(
  chunks: { row: number; col: number; buildings: Building[] }[],
  meta: { worldBounds: { minX: number; minZ: number }; size: { width: number; depth: number }; chunks: number }
): Batch[] {
  const batches: Batch[] = [];
  for (const chunk of chunks) {
    const cw = meta.size.width / meta.chunks;
    const cd = meta.size.depth / meta.chunks;
    // 4×4 sub-cells per chunk gives batches that are close together locally.
    const SUB = 4;
    const cells: Building[][] = Array.from({ length: SUB * SUB }, () => []);
    for (const b of chunk.buildings) {
      let cx = 0, cz = 0;
      for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
      const n = b.p.length / 2;
      const col = Math.min(SUB - 1, Math.max(0, Math.floor((((cx / n) - meta.worldBounds.minX) / meta.size.width) * meta.chunks * SUB - chunk.col * SUB)));
      const row = Math.min(SUB - 1, Math.max(0, Math.floor((((cz / n) - meta.worldBounds.minZ) / meta.size.depth) * meta.chunks * SUB - chunk.row * SUB)));
      cells[row * SUB + col].push(b);
    }
    cells.forEach((list, index) => {
      const subCol = index % SUB;
      const subRow = Math.floor(index / SUB);
      const cellW = cw / SUB;
      const cellD = cd / SUB;
      for (let start = 0; start < list.length; start += BATCH) {
        batches.push({
          key: `${chunk.row}${chunk.col}-${index}-${start}`,
          buildings: list.slice(start, start + BATCH),
          center: {
            x: meta.worldBounds.minX + chunk.col * cw + (subCol + 0.5) * cellW,
            z: meta.worldBounds.minZ + chunk.row * cd + (subRow + 0.5) * cellD,
          },
        });
      }
    });
  }
  return batches;
}

export function Buildings({
  chunks,
  meta,
}: {
  chunks: { row: number; col: number; buildings: Building[] }[];
  meta: { worldBounds: { minX: number; minZ: number }; size: { width: number; depth: number }; chunks: number };
}) {
  const batches = useMemo(() => makeBatches(chunks, meta), [chunks, meta]);
  return (
    <group>
      {batches.map((batch) => (
        <BuildingBatch key={batch.key} buildings={batch.buildings} center={batch.center} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Street props                                                        */
/* ------------------------------------------------------------------ */

export function Trees({ trees }: { trees: number[][] }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => trees.slice(0, 9000), [trees]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const t = trunk.current;
    const c = canopy.current;
    if (!t || !c) return;
    for (let i = 0; i < data.length; i++) {
      const [x, z, scale = 1] = data[i];
      dummy.position.set(x, 1.55 * scale, z);
      dummy.rotation.set(0, i * 1.7, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      t.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 4.05 * scale, z);
      dummy.scale.set(scale * 1.05, scale * 1.15, scale * 1.05);
      dummy.updateMatrix();
      c.setMatrixAt(i, dummy.matrix);
      const shade = 0.75 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.5;
      c.setColorAt(i, new THREE.Color(0.2 * shade, 0.34 * shade, 0.16 * shade));
    }
    t.count = data.length;
    c.count = data.length;
    t.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [data, dummy]);

  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, Math.max(1, data.length)]} castShadow receiveShadow frustumCulled>
        <cylinderGeometry args={[0.18, 0.3, 3.1, 6]} />
        <meshStandardMaterial color="#40372a" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={canopy} args={[undefined, undefined, Math.max(1, data.length)]} castShadow frustumCulled>
        <icosahedronGeometry args={[1.9, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.86} flatShading />
      </instancedMesh>
    </group>
  );
}

export function StreetLights({ lights }: { lights: number[][] }) {
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const data = useMemo(() => lights.slice(0, 2600), [lights]);

  useLayoutEffect(() => {
    const p = poles.current;
    const h = heads.current;
    if (!p || !h) return;
    for (let i = 0; i < data.length; i++) {
      const [x, z, side = 1] = data[i];
      dummy.position.set(x, 3.9, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      p.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + side * 0.8, 7.65, z);
      dummy.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
      dummy.updateMatrix();
      h.setMatrixAt(i, dummy.matrix);
    }
    p.count = data.length;
    h.count = data.length;
    p.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  }, [data, dummy]);

  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, Math.max(1, data.length)]} castShadow frustumCulled>
        <cylinderGeometry args={[0.075, 0.11, 7.8, 5]} />
        <meshStandardMaterial color="#4c514d" roughness={0.6} metalness={0.55} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, Math.max(1, data.length)]} frustumCulled>
        <boxGeometry args={[1.85, 0.14, 0.34]} />
        <meshStandardMaterial color="#5a6a63" metalness={0.6} roughness={0.4} emissive="#2a3236" emissiveIntensity={0.25} />
      </instancedMesh>
    </group>
  );
}

export function StreetFurniture({ items }: { items: Furniture[] }) {
  const benches = useRef<THREE.InstancedMesh>(null);
  const benchBacks = useRef<THREE.InstancedMesh>(null);
  const bins = useRef<THREE.InstancedMesh>(null);
  const planters = useRef<THREE.InstancedMesh>(null);
  const shrubs = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const signs = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const groups = useMemo(() => {
    const by = { bench: [] as Furniture[], bin: [] as Furniture[], planter: [] as Furniture[], sign: [] as Furniture[] };
    for (const item of items) by[item.kind].push(item);
    return by;
  }, [items]);

  useLayoutEffect(() => {
    const place = (mesh: THREE.InstancedMesh | null, list: Furniture[], local: (i: number) => [number, number, number]) => {
      if (!mesh) return;
      for (let i = 0; i < list.length; i++) {
        const [lx, ly, lz] = local(i);
        const c = Math.cos(list[i].yaw), s = Math.sin(list[i].yaw);
        dummy.position.set(list[i].x + c * lx + s * lz, ly, list[i].z - s * lx + c * lz);
        dummy.rotation.set(0, list[i].yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(benches.current, groups.bench, () => [0, 0.46, 0]);
    place(benchBacks.current, groups.bench, () => [0, 0.72, -0.19]);
    place(bins.current, groups.bin, () => [0, 0.45, 0]);
    place(planters.current, groups.planter, () => [0, 0.33, 0]);
    place(shrubs.current, groups.planter, () => [0, 0.85, 0]);
    place(posts.current, groups.sign, () => [0, 1.25, 0]);
    place(signs.current, groups.sign, () => [0, 2.28, 0]);
  }, [groups, dummy]);

  return (
    <group>
      <instancedMesh ref={benches} args={[undefined, undefined, Math.max(1, groups.bench.length)]} castShadow frustumCulled>
        <boxGeometry args={[1.65, 0.1, 0.46]} />
        <meshStandardMaterial color="#6b5238" roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={benchBacks} args={[undefined, undefined, Math.max(1, groups.bench.length)]} castShadow frustumCulled>
        <boxGeometry args={[1.65, 0.44, 0.08]} />
        <meshStandardMaterial color="#6b5238" roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={bins} args={[undefined, undefined, Math.max(1, groups.bin.length)]} castShadow frustumCulled>
        <cylinderGeometry args={[0.26, 0.3, 0.9, 10]} />
        <meshStandardMaterial color="#31403a" roughness={0.7} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={planters} args={[undefined, undefined, Math.max(1, groups.planter.length)]} castShadow receiveShadow frustumCulled>
        <boxGeometry args={[0.92, 0.66, 0.92]} />
        <meshStandardMaterial color="#8a8578" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={shrubs} args={[undefined, undefined, Math.max(1, groups.planter.length)]} castShadow frustumCulled>
        <icosahedronGeometry args={[0.56, 1]} />
        <meshStandardMaterial color="#37522d" roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, Math.max(1, groups.sign.length)]} castShadow>
        <boxGeometry args={[0.07, 2.5, 0.07]} />
        <meshStandardMaterial color="#3a4240" roughness={0.55} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={signs} args={[undefined, undefined, Math.max(1, groups.sign.length)]} castShadow>
        <boxGeometry args={[1.15, 0.48, 0.06]} />
        <meshStandardMaterial color="#11191a" roughness={0.5} emissive="#1d2a24" emissiveIntensity={0.25} />
      </instancedMesh>
    </group>
  );
}

export function TrafficSignals({ signals }: { signals: number[] }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = Math.floor(signals.length / 2);

  useLayoutEffect(() => {
    if (count === 0 || !posts.current || !lamps.current) return;
    for (let i = 0; i < count; i++) {
      const x = signals[i * 2];
      const z = signals[i * 2 + 1];
      dummy.position.set(x, 1.9, z);
      dummy.updateMatrix();
      posts.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 3.6, z);
      dummy.updateMatrix();
      lamps.current.setMatrixAt(i, dummy.matrix);
    }
    posts.current.count = count;
    lamps.current.count = count;
    posts.current.instanceMatrix.needsUpdate = true;
    lamps.current.instanceMatrix.needsUpdate = true;
  }, [signals, count, dummy]);

  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 3.8, 5]} />
        <meshStandardMaterial color="#3c4240" roughness={0.7} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, count]}>
        <boxGeometry args={[0.26, 0.7, 0.24]} />
        <meshStandardMaterial color="#101715" emissive="#2bff9a" emissiveIntensity={0.55} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Project stations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Each destination is a landmark built for this portfolio: a plinth, a
 * monolith in the project's colour and a floating label. They sit on real
 * streets but are explicitly *not* mapped local landmarks, and the UI never
 * presents them as such.
 */
export function Stations({ stations, onSelect }: { stations: StationData[]; onSelect?: (zone: string) => void }) {
  return (
    <group>
      {stations.map((station, index) => (
        <Station key={station.zone} station={station} index={index} onSelect={onSelect} />
      ))}
    </group>
  );
}

function Station({ station, index, onSelect }: { station: StationData; index: number; onSelect?: (zone: string) => void }) {
  const dest = destinationByZone(station.zone);
  const color = dest?.color ?? '#f2b300';
  const title = dest?.label ?? station.label;
  const subtitle = dest?.sub ?? 'Destination';
  const height = station.zone === 'home' ? 3.4 : 4.2 + (index % 3) * 0.9;

  const texture = useMemo(() => labelTexture(title, subtitle, color), [title, subtitle, color]);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.elapsedTime * 0.6 + index;
    ring.current.scale.setScalar(1 + Math.sin(t) * 0.04);
  });

  // The marker stays on the road (where the route ends), but the plinth and
  // monolith stand on the verge beside it. The earlier version placed the
  // landmark exactly on the spawn point, so the first thing the player saw was
  // the car buried inside a 7 m black slab.
  const side = 1;
  const offset = 4.6;
  const ox = Math.cos(station.heading) * offset * side;
  const oz = -Math.sin(station.heading) * offset * side;

  return (
    <group position={[station.x, 0, station.z]}>
      {/* route-end ring, flush with the asphalt */}
      <mesh ref={ring} position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.05, 2.24, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.62} side={THREE.DoubleSide} />
      </mesh>

      <group position={[ox, 0, oz]}>
        {/* plinth */}
        <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[1.45, 1.6, 0.24, 20]} />
          <meshStandardMaterial color="#20292a" roughness={0.8} metalness={0.2} />
        </mesh>

        {/* monolith: a signed piece of street furniture, not a tower */}
        <mesh position={[0, height / 2 + 0.26, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.78, height, 0.3]} />
          <meshStandardMaterial color="#121a1b" metalness={0.62} roughness={0.32} />
        </mesh>
        <mesh position={[0, height + 0.3, 0]}>
          <boxGeometry args={[0.84, 0.07, 0.36]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[0, height / 2 + 0.26, 0.16]}>
          <planeGeometry args={[0.12, height * 0.84]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} />
        </mesh>

        {station.zone !== 'home' && (
          <sprite position={[0, height + 1.2, 0]} scale={[4.2, 1.31, 1]}>
            <spriteMaterial map={texture} transparent depthWrite={false} />
          </sprite>
        )}

        {onSelect && (
          <mesh
            position={[0, 1.4, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(station.zone);
            }}
          >
            <cylinderGeometry args={[1.9, 1.9, 3, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
