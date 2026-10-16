'use client';

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { vehicle as vehicleState } from './store';
import type { BuildingSpec, Road, Ring, Station, WorldLayout } from './world-layout';
import { Atmosphere as SkyRig, Glow } from './atmosphere';
import { AssetLayer } from './asset-layer';
import { WORLD_ASSETS_ENABLED } from './assets';
import { VehicleMesh } from './vehicle';
import { MAP_SPAN_METERS } from './geo';

const LIME = '#d8f851';
const CYAN = '#6de0dd';
const INK = '#0b1415';

/**
 * One draw call for many identical, static parts. Transforms are baked once and
 * never change, so the instance matrices are uploaded on mount only. This replaces
 * the hundreds of individual meshes that previously formed the street furniture
 * and road markings.
 */
function Instances({ geometry, material, transforms }: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  transforms: THREE.Matrix4[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < transforms.length; i++) mesh.setMatrixAt(i, transforms[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [transforms]);
  return <instancedMesh ref={ref} args={[geometry, material, transforms.length]} frustumCulled={false} />;
}

/** Bake a parent pose × local pose into a single matrix (three's T·R·S order). */
function poseMatrix(
  px: number, py: number, pz: number, parentRotY: number, parentScale: number,
  local: { p: readonly [number, number, number]; r?: readonly [number, number, number] }
): THREE.Matrix4 {
  const parent = new THREE.Object3D();
  parent.position.set(px, py, pz);
  parent.rotation.y = parentRotY;
  parent.scale.setScalar(parentScale);
  parent.updateMatrix();
  const child = new THREE.Object3D();
  child.position.set(local.p[0], local.p[1], local.p[2]);
  if (local.r) child.rotation.set(local.r[0], local.r[1], local.r[2]);
  child.updateMatrix();
  return parent.matrix.clone().multiply(child.matrix);
}

/* Shared, immutable ground-marking geometry/materials — reused by every instanced batch. */
const groundMarkGeo = new THREE.PlaneGeometry(0.075, 1);
const groundMarkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 });
const seamGeo = new THREE.PlaneGeometry(0.018, 12);
const seamMat = new THREE.MeshBasicMaterial({ color: '#a49d8e', transparent: true, opacity: 0.35 });
const ringMarkGeo = new THREE.BoxGeometry(0.075, 0.02, 1.05);
const ringMarkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 });

/** Street furniture, expressed as instanced parts so a whole street is a few draw calls. */
const furniture = {
  lamp: [
    { geo: new THREE.CylinderGeometry(0.055, 0.09, 3.2, 8), mat: new THREE.MeshStandardMaterial({ color: '#6d7871', metalness: 0.6, roughness: 0.35 }), local: { p: [0, 1.6, 0] as const } },
    { geo: new THREE.BoxGeometry(0.72, 0.07, 0.1), mat: new THREE.MeshStandardMaterial({ color: '#7d8880', metalness: 0.5, roughness: 0.4 }), local: { p: [0.28, 3.08, 0] as const, r: [0, 0, -0.18] as const } },
    { geo: new THREE.BoxGeometry(0.3, 0.12, 0.22), mat: new THREE.MeshStandardMaterial({ color: '#e5f7be', emissive: '#d8f851', emissiveIntensity: 2.2 }), local: { p: [0.58, 3.0, 0] as const } },
  ],
  tree: [
    { geo: new THREE.CylinderGeometry(0.68, 0.78, 0.36, 8), mat: new THREE.MeshStandardMaterial({ color: '#26332e', roughness: 0.9 }), local: { p: [0, 0.18, 0] as const } },
    { geo: new THREE.CylinderGeometry(0.48, 0.57, 0.18, 8), mat: new THREE.MeshStandardMaterial({ color: '#4c5b4e', roughness: 0.9 }), local: { p: [0, 0.42, 0] as const } },
    { geo: new THREE.CylinderGeometry(0.09, 0.15, 1.95, 7), mat: new THREE.MeshStandardMaterial({ color: '#57483a', roughness: 1 }), local: { p: [0, 1.45, 0] as const } },
    { geo: new THREE.IcosahedronGeometry(0.86, 1), mat: new THREE.MeshStandardMaterial({ color: '#2d5141', roughness: 0.92 }), local: { p: [0, 2.45, 0] as const } },
    { geo: new THREE.IcosahedronGeometry(0.48, 1), mat: new THREE.MeshStandardMaterial({ color: '#3b694b', roughness: 0.92 }), local: { p: [0.28, 2.72, -0.12] as const } },
    { geo: new THREE.IcosahedronGeometry(0.46, 1), mat: new THREE.MeshStandardMaterial({ color: '#244b3c', roughness: 0.92 }), local: { p: [-0.26, 2.35, 0.18] as const } },
  ],
} as const;

/* --------------------------------------------------------- road network ---- *
 * The road armature is designed before the buildings and rendered as one system:
 * segment surfaces, rounded junctions at every crossing, kerbs + sidewalks along
 * every street, centre markings and ring roundabouts. Each layer sits at its own
 * y so coplanar quads can never z-fight at an intersection (the previous build
 * laid eight flat quads at the exact same height, which flickered where they
 * overlapped). */

const ROAD_Y = -0.075;
const JUNCTION_Y = -0.066;
const RING_Y = -0.062;
const KERB_COLOR = '#c4beb1';
const SIDEWALK_COLOR = '#d8d3c7';

/** 2D segment intersection (used to place junction pads where two roads cross). */
function segIntersection(a: Road, b: Road): { x: number; z: number } | null {
  const x1 = a.x1, z1 = a.z1, x2 = a.x2, z2 = a.z2;
  const x3 = b.x1, z3 = b.z1, x4 = b.x2, z4 = b.z2;
  const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(den) < 1e-6) return null;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (z1 - z2) - (z1 - z3) * (x1 - x2)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1) };
}

type Junction = { x: number; z: number; size: number };

/**
 * Renders the data-driven road armature for a city (see `WorldLayout.roads`).
 * Junctions are drawn as rounded pads slightly above the crossing quads (their
 * own y layer) so intersections read cleanly and never z-fight.
 */
function RoadNetwork({ roads, rings = [] }: { roads: Road[]; rings?: Ring[] }) {
  const junctions = useMemo<Junction[]>(() => {
    const out: Junction[] = [];
    for (let i = 0; i < roads.length; i++) {
      for (let j = i + 1; j < roads.length; j++) {
        const p = segIntersection(roads[i], roads[j]);
        if (!p) continue;
        if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.6)) continue;
        out.push({ x: p.x, z: p.z, size: Math.max(roads[i].width, roads[j].width) + 0.7 });
      }
    }
    return out;
  }, [roads]);

  return (
    <group>
      {rings.map((r, i) => (
        <group key={`ring-${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.x, -0.062, r.z]} receiveShadow>
            <ringGeometry args={[r.radius, r.radius + r.width, 128]} />
            <meshStandardMaterial color="#d0cbbf" roughness={0.92} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.x, -0.05, r.z]}>
            <ringGeometry args={[r.radius, r.radius + 0.1, 128]} />
            <meshBasicMaterial color={LIME} transparent opacity={0.3} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.x, -0.048, r.z]}>
            <ringGeometry args={[r.radius + r.width - 0.1, r.radius + r.width, 128]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
        </group>
      ))}

      {roads.map((r, i) => {
        const dx = r.x2 - r.x1;
        const dz = r.z2 - r.z1;
        const length = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const cx = (r.x1 + r.x2) / 2;
        const cz = (r.z1 + r.z2) / 2;
        const arterial = r.kind === 'arterial';
        const lane = r.kind === 'lane';
        const kerbOffset = r.width / 2 + 0.12;
        return (
          <group key={`road-${i}`} position={[cx, 0, cz]} rotation={[0, angle, 0]}>
            {/* Surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.075, 0]} receiveShadow>
              <planeGeometry args={[r.width, length]} />
              <meshStandardMaterial color={arterial ? '#cbc6b9' : '#d6d1c5'} roughness={0.92} />
            </mesh>
            {/* Centre line on arterials */}
            {arterial && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.064, 0]}>
                <planeGeometry args={[0.09, length]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
              </mesh>
            )}
            {/* Kerbs + sidewalks (skipped on back lanes, which are kerb-less) */}
            {!lane && [-1, 1].map((side) => (
              <group key={`kerb-${side}`}>
                <mesh position={[side * kerbOffset, 0.03, 0]} receiveShadow>
                  <boxGeometry args={[0.24, 0.18, length]} />
                  <meshStandardMaterial color="#c4beb1" roughness={0.92} metalness={0.04} />
                </mesh>
                <mesh position={[side * (kerbOffset + 0.42), 0.02, 0]} receiveShadow>
                  <boxGeometry args={[0.6, 0.14, length]} />
                  <meshStandardMaterial color="#bdb7aa" roughness={0.94} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {junctions.map((j, i) => (
        <group key={`junction-${i}`} position={[j.x, 0, j.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.062, 0]} receiveShadow>
            <circleGeometry args={[j.size / 2 + 0.35, 40]} />
            <meshStandardMaterial color="#cdc8bb" roughness={0.92} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.055, 0]}>
            <ringGeometry args={[j.size / 2 + 0.24, j.size / 2 + 0.32, 48]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Soft themed ground discs that make each quarter of a city read distinctly. */
function Districts({ world }: { world: WorldLayout }) {
  const districts = world.districts;
  if (!districts || districts.length === 0) return null;
  return (
    <group>
      {districts.map((d) => (
        <group key={d.name}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[d.x, -0.04, d.z]}>
            <circleGeometry args={[d.radius, 64]} />
            <meshBasicMaterial color={d.color} transparent opacity={0.07} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[d.x, -0.038, d.z]}>
            <ringGeometry args={[d.radius - 0.08, d.radius, 96]} />
            <meshBasicMaterial color={d.color} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function HubFloor({ world, showBase }: { world: WorldLayout; showBase: boolean }) {
  const roadMarks = useMemo(() => {
    const marks: { x: number; z: number; rotation: number; length: number }[] = [];
    for (let z = -22; z <= 22; z += 3.2) {
      marks.push({ x: 0, z, rotation: 0, length: 1.25 });
      marks.push({ x: 9.1, z, rotation: 0, length: 1.05 });
      marks.push({ x: -9.1, z, rotation: 0, length: 1.05 });
    }
    for (let x = -22; x <= 22; x += 3.2) {
      marks.push({ x, z: 0, rotation: Math.PI / 2, length: 1.25 });
      marks.push({ x, z: 9.1, rotation: Math.PI / 2, length: 1.05 });
      marks.push({ x, z: -9.1, rotation: Math.PI / 2, length: 1.05 });
    }
    return marks;
  }, []);
  const markTransforms = useMemo(() => roadMarks.map((mark) => {
    const o = new THREE.Object3D();
    o.position.set(mark.x, -0.045, mark.z);
    o.rotation.set(-Math.PI / 2, 0, mark.rotation);
    o.scale.set(1, mark.length, 1);
    o.updateMatrix();
    return o.matrix.clone();
  }), [roadMarks]);
  const seamTransforms = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i < 13; i++) {
      const n = i - 6;
      const along = new THREE.Object3D();
      along.position.set(n * 2.2, -0.03, 0);
      along.rotation.set(-Math.PI / 2, 0, 0);
      along.updateMatrix();
      out.push(along.matrix.clone());
      const across = new THREE.Object3D();
      across.position.set(0, -0.029, n * 2.2);
      across.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      across.updateMatrix();
      out.push(across.matrix.clone());
    }
    return out;
  }, []);
  return (
    <group>
      {showBase && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
          <planeGeometry args={[64, 64]} />
          <meshStandardMaterial color="#e8e3d6" roughness={0.98} metalness={0.02} />
        </mesh>
      )}
      {/* The main streets frame the plaza instead of covering it with a debug grid. */}
      <RoadNetwork roads={world.roads} rings={world.rings} />
      <Instances geometry={groundMarkGeo} material={groundMarkMat} transforms={markTransforms} />
      {/* Inlaid plaza rings guide the eye toward the central landmark. */}
      {[5.2, 6.1, 13.8, 14.1, 17.2].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035 + i * 0.001, 0]}>
          <ringGeometry args={[r, r + (i === 2 ? 0.12 : 0.035), 128]} />
          <meshBasicMaterial color={i === 2 ? LIME : '#b6ae9e'} transparent opacity={i === 2 ? 0.3 : 0.28} />
        </mesh>
      ))}
      {/* Subtle plaza tile seams (single instanced mesh) */}
      <Instances geometry={seamGeo} material={seamMat} transforms={seamTransforms} />
    </group>
  );
}

/** A simpler city floor: ground plane, a ring road around the landmark, and a north-south lane. */
function DistrictFloor({ world, showBase }: { world: WorldLayout; showBase: boolean }) {
  const radius = world.landmark ? world.landmark.radius + 2.2 : 4;
  const ringMarkTransforms = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const markRadius = radius + 2.75;
    const o = new THREE.Object3D();
    o.position.set(Math.sin(angle) * (markRadius - 0.6), -0.045, Math.cos(angle) * (markRadius + 0.6));
    o.rotation.set(0, -angle, 0);
    o.updateMatrix();
    return o.matrix.clone();
  }), [radius]);
  return (
    <group>
      {showBase && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
          <planeGeometry args={[64, 64]} />
          <meshStandardMaterial color="#e8e3d6" roughness={0.98} metalness={0.02} />
        </mesh>
      )}
      {/* The road armature (grid + junctions + kerbs) is data-driven per city. */}
      <RoadNetwork roads={world.roads} rings={world.rings} />
      <Instances geometry={ringMarkGeo} material={ringMarkMat} transforms={ringMarkTransforms} />
    </group>
  );
}

/**
 * Zebra crossings at the four cardinal road approaches. Purely decorative: the
 * collision layer (physics.ts) is untouched, and every bar is merged into a single
 * mesh, so a whole crossing costs one draw call.
 */
function Crossings({ distance, roadWidth }: { distance: number; roadWidth: number }) {
  const geometry = useMemo(() => {
    const count = Math.max(3, Math.floor(roadWidth / 0.85));
    const spacing = roadWidth / count;
    const bar = new THREE.BoxGeometry(0.42, 0.02, 1.5);
    const bars: THREE.BufferGeometry[] = [];
    const place = (x: number, z: number, alongX: boolean) => {
      for (let i = 0; i < count; i++) {
        const across = (i - (count - 1) / 2) * spacing;
        const g = bar.clone();
        if (alongX) g.rotateY(Math.PI / 2);
        g.translate(alongX ? x : x + across, 0, alongX ? z + across : z);
        bars.push(g);
      }
    };
    place(0, distance, false);
    place(0, -distance, false);
    place(distance, 0, true);
    place(-distance, 0, true);
    bar.dispose();
    return mergeGeometries(bars, false);
  }, [distance, roadWidth]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, -0.04, 0]}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
    </mesh>
  );
}

function GroundDetails({ world }: { world: WorldLayout }) {
  if (world.id === 'hub') {
    return (
      <group>
        <Crossings distance={7} roadWidth={5.5} />
        {/* Crosswalk at the arrival plaza */}
        <group position={[0, 0, 14]}>
          {Array.from({ length: 7 }, (_, i) => i - 3).map((n) => (
            <mesh key={n} position={[n * 0.7, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.42, 2.6]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }
  const radius = world.landmark ? world.landmark.radius + 2.2 : 4;
  return (
    <group>
      <Crossings distance={radius + 6.7} roadWidth={6} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.14, 128]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 5.5, radius + 5.64, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Building({ spec, index }: { spec: BuildingSpec; index: number }) {
  const { x, z, w, d, h, tint, accent, style } = spec;
  const windowRows = Math.max(2, Math.floor(h / 1.25));
  const windowCols = Math.max(2, Math.floor(w / 0.65));
  const windowGeoms = useMemo(() => {
    const paneGeo = new THREE.PlaneGeometry(Math.min(0.36, w / (windowCols + 1)), 0.48);
    const sillGeo = new THREE.BoxGeometry(Math.min(0.42, w / windowCols), 0.055, 0.055);
    const panes: THREE.BufferGeometry[] = [];
    const accents: THREE.BufferGeometry[] = [];
    const sills: THREE.BufferGeometry[] = [];
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const wx = (col - (windowCols - 1) / 2) * (w / (windowCols + 0.7));
        const wy = 0.65 + row * 1.05;
        const pane = paneGeo.clone();
        pane.translate(wx, wy, d / 2 + 0.012);
        ((row * windowCols + col) % 5 === 0 ? accents : panes).push(pane);
        const sill = sillGeo.clone();
        sill.translate(wx, wy, d / 2 - 0.006);
        sills.push(sill);
      }
    }
    paneGeo.dispose();
    sillGeo.dispose();
    return {
      panes: panes.length ? mergeGeometries(panes, false) : null,
      accents: accents.length ? mergeGeometries(accents, false) : null,
      sills: mergeGeometries(sills, false),
    };
  }, [windowRows, windowCols, w, d]);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[w + 0.55, 0.36, d + 0.55]} />
        <meshStandardMaterial color="#c6c0b3" roughness={0.88} />
      </mesh>
      <mesh position={[0, h / 2 + 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={tint} roughness={0.86} metalness={0.06} />
      </mesh>
      {/* Recessed-looking window bays, merged into three meshes per building to keep the
          draw-call count low (there can be ~60 windows per facade). */}
      {windowGeoms.panes && (
        <mesh geometry={windowGeoms.panes}>
          <meshStandardMaterial color="#2f4a47" emissive="#123330" emissiveIntensity={0.14} roughness={0.28} metalness={0.4} />
        </mesh>
      )}
      {windowGeoms.accents && (
        <mesh geometry={windowGeoms.accents}>
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.65} roughness={0.3} metalness={0.35} />
        </mesh>
      )}
      {windowGeoms.sills && (
        <mesh geometry={windowGeoms.sills}>
          <meshStandardMaterial color="#b3ada0" metalness={0.2} roughness={0.6} />
        </mesh>
      )}
      {/* Vertical architectural spine */}
      <mesh position={[w / 2 - 0.16, h / 2 + 0.37, d / 2 + 0.035]}>
        <boxGeometry args={[0.075, h * 0.9, 0.07]} />
        <meshBasicMaterial color={accent} transparent opacity={0.78} />
      </mesh>
      {style === 'terrace' && (
        <group position={[0, h + 0.42, 0]}>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[w * 0.72, 0.32, d * 0.68]} />
            <meshStandardMaterial color="#bdb7aa" metalness={0.15} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[w * 0.44, 0.08, d * 0.4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}
      {style === 'spire' && (
        <group position={[0, h + 0.55, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.035, 0.11, 0.9, 6]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
          </mesh>
        </group>
      )}
      {style === 'loft' && (
        <mesh position={[0, h + 0.48, 0]}>
          <boxGeometry args={[w * 0.64, 0.24, d * 0.64]} />
          <meshStandardMaterial color="#4d5a54" metalness={0.3} roughness={0.5} />
        </mesh>
      )}
      {style === 'slab' && (
        <mesh position={[0, h + 0.2, 0]}>
          <boxGeometry args={[w + 0.1, 0.12, d + 0.1]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.18} />
        </mesh>
      )}
      <mesh position={[0, 0.58, d / 2 + 0.04]}>
        <boxGeometry args={[w * 0.72, 0.34, 0.08]} />
        <meshStandardMaterial color="#3a4a44" metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.59, d / 2 + 0.09]}>
        <planeGeometry args={[w * 0.6, 0.15]} />
        <meshBasicMaterial color={accent} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** Street lamps and trees as instanced parts — one draw call per part instead of per prop. */
function UrbanDetails({ world, lamps = true }: { world: WorldLayout; lamps?: boolean }) {
  const lampParts = useMemo(() => furniture.lamp.map((part) =>
    world.lampPositions.map(([x, z], i) => poseMatrix(x, 0, z, i % 2 ? Math.PI : 0, 1, part.local)),
  ), [world.lampPositions]);
  const treeParts = useMemo(() => furniture.tree.map((part) =>
    world.treePositions.map(([x, z, scale]) => poseMatrix(x, 0, z, 0, scale, part.local)),
  ), [world.treePositions]);
  return (
    <group>
      {lamps && furniture.lamp.map((part, i) => <Instances key={`lamp-${i}`} geometry={part.geo} material={part.mat} transforms={lampParts[i]} />)}
      {lamps && world.lampPositions.map(([x, z], i) => (
        <Glow key={`lampglow-${i}`} x={x + (i % 2 ? -0.58 : 0.58)} y={2.98} z={z} color="#f4ffcc" size={2.8} opacity={0.5} />
      ))}
      {furniture.tree.map((part, i) => <Instances key={`tree-${i}`} geometry={part.geo} material={part.mat} transforms={treeParts[i]} />)}
    </group>
  );
}

function PerimeterWall({ world }: { world: WorldLayout }) {
  return (
    <group>
      {world.perimeterWalls.map((w, i) => (
        <group key={`wall-${i}`} position={[w.x, 0, w.z]}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <boxGeometry args={[w.hx * 2, 0.6, w.hz * 2]} />
            <meshStandardMaterial color="#d5cfc2" roughness={0.92} metalness={0.03} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[w.hx * 2, 0.06, w.hz * 2]} />
            <meshBasicMaterial color={LIME} transparent opacity={0.24} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CentralLandmark({ radius }: { radius: number }) {
  const core = useRef<THREE.Mesh>(null!);
  const orbit = useRef<THREE.Group>(null!);
  const scale = radius / 3.6;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.2;
      core.current.rotation.x = Math.sin(t * 0.18) * 0.08;
    }
    if (orbit.current) orbit.current.rotation.y = -t * 0.12;
  });
  return (
    <group position={[0, 0, 0]} scale={scale}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[3.25, 3.6, 0.4, 64]} />
        <meshStandardMaterial color="#cfc9bc" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[2.9, 3.05, 0.08, 64]} />
        <meshStandardMaterial color="#bdb7aa" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.55, 2.72, 96]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.8} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
        <mesh key={n} position={[Math.sin((n / 8) * Math.PI * 2) * 2.18, 0.65, Math.cos((n / 8) * Math.PI * 2) * 2.18]}>
          <boxGeometry args={[0.16, 0.28, 0.16]} />
          <meshStandardMaterial color={n % 2 ? CYAN : LIME} emissive={n % 2 ? CYAN : LIME} emissiveIntensity={0.8} />
        </mesh>
      ))}
      <mesh ref={core} position={[0, 2.35, 0]} castShadow>
        <dodecahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color="#dfe8d8" emissive={LIME} emissiveIntensity={0.4} metalness={0.55} roughness={0.24} />
      </mesh>
      <group ref={orbit} position={[0, 2.35, 0]}>
        <mesh rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[1.58, 0.035, 8, 96]} />
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.9} metalness={0.65} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 3]}>
          <torusGeometry args={[1.38, 0.025, 8, 96]} />
          <meshStandardMaterial color={LIME} emissive={LIME} emissiveIntensity={0.8} metalness={0.65} />
        </mesh>
      </group>
      <pointLight position={[0, 2.5, 0]} color={LIME} intensity={9} distance={14} decay={2} />
      <Glow x={0} y={2.35} z={0} color={LIME} size={5.4} opacity={0.42} />
      <Glow x={0} y={0.9} z={0} color={CYAN} size={4.2} opacity={0.28} />
    </group>
  );
}

/** All station pads share a single animation frame instead of one useFrame each. */
function StationPads({ stations }: { stations: Station[] }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.5;
    for (let i = 0; i < stations.length; i++) {
      const mesh = rings.current[i];
      if (mesh) mesh.scale.setScalar(1 + Math.sin(t + stations[i].x + stations[i].z) * 0.025);
    }
  });
  return (
    <>
      {stations.map((station, i) => (
        <group key={station.zone} position={[station.x, 0.035, station.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[2.25, 64]} />
            <meshStandardMaterial color="#eae4d8" roughness={0.85} metalness={0.05} />
          </mesh>
          <mesh ref={(node) => { rings.current[i] = node; }} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.85, 1.94, 64]} />
            <meshBasicMaterial color={station.color} transparent opacity={0.82} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <ringGeometry args={[0.72, 0.78, 48]} />
            <meshBasicMaterial color={station.color} transparent opacity={0.38} />
          </mesh>
          {[0, 1, 2, 3].map((n) => (
            <mesh key={n} position={[Math.cos(n * Math.PI / 2) * 2.05, 0.08, Math.sin(n * Math.PI / 2) * 2.05]}>
              <boxGeometry args={[0.12, 0.16, 0.12]} />
              <meshStandardMaterial color={station.color} emissive={station.color} emissiveIntensity={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function StationPedestal({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.72, 1.3, 8]} />
        <meshStandardMaterial color="#cbc5b8" metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.34, 0]}>
        <cylinderGeometry args={[0.58, 0.58, 0.08, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <octahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} metalness={0.25} roughness={0.25} />
      </mesh>
      <Glow x={0} y={1.78} z={0} color={color} size={2.2} opacity={0.4} />
    </group>
  );
}

/** A vertical ring framing the station — the visual signature of an inter-city portal. */
function PortalGate({ x, z, color }: { x: number; z: number; color: string }) {
  const shard = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (shard.current) {
      const t = clock.elapsedTime;
      shard.current.rotation.y = t * 0.6;
      shard.current.position.y = 1.7 + Math.sin(t * 1.4) * 0.12;
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.7, 0]}>
        <torusGeometry args={[1.15, 0.07, 12, 64]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.7, 0]} rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[1.28, 0.035, 10, 48]} />
        <meshStandardMaterial color={LIME} emissive={LIME} emissiveIntensity={0.7} transparent opacity={0.45} />
      </mesh>
      <mesh ref={shard} position={[0, 1.7, 0]}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} metalness={0.3} roughness={0.2} />
      </mesh>
      <Glow x={0} y={1.7} z={0} color={color} size={5} opacity={0.5} />
    </group>
  );
}

function CitySkirt({ world, show }: { world: WorldLayout; show: boolean }) {
  if (!show) return null;
  const fade = world.theme.fog[2];
  return (
    <group>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[30, 96]} />
        <meshBasicMaterial color="#0c1715" transparent opacity={0.42} />
      </mesh>
      {Array.from({ length: 20 }, (_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const radius = Math.max(27, fade * 0.6) + (i % 3) * 1.1;
        const height = 3 + (i % 4) * 2.1;
        return (
          <mesh key={i} position={[Math.sin(angle) * radius, height / 2, Math.cos(angle) * radius]}>
            <boxGeometry args={[3.4, height, 3.4]} />
            <meshStandardMaterial color="#0a1714" roughness={0.98} metalness={0.02} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * The real map, drawn as the base ground beneath the designed city. Rendered only
 * when a live MapLibre texture is available; otherwise the procedural floor above
 * remains the ground, so the world is never left without a floor.
 */
function MapPlane({ texture }: { texture?: THREE.Texture | null }) {
  if (!texture) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
      <planeGeometry args={[MAP_SPAN_METERS, MAP_SPAN_METERS]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function World({ world, lowPower = false, mapTexture }: { world: WorldLayout; lowPower?: boolean; mapTexture?: THREE.Texture | null }) {
  const hasMap = Boolean(mapTexture);
  return (
    <group>
      <SkyRig theme={world.theme} lowPower={lowPower} />
      <pointLight position={[-12, 8, -8]} intensity={4} color="#e6f0ea" distance={26} />
      <pointLight position={[12, 7, 12]} intensity={3} color="#fff2df" distance={22} />
      <MapPlane texture={mapTexture} />
      <Districts world={world} />
      {world.id === 'hub' ? <HubFloor world={world} showBase={!hasMap} /> : <DistrictFloor world={world} showBase={!hasMap} />}
      <GroundDetails world={world} />
      <CitySkirt world={world} show={!hasMap} />
      {world.buildings.map((spec, index) => <Building key={`${spec.x}-${spec.z}`} spec={spec} index={index} />)}
      <PerimeterWall world={world} />
      <UrbanDetails world={world} lamps={!WORLD_ASSETS_ENABLED} />
      <AssetLayer world={world} lowPower={lowPower} />
      <StationPads stations={world.stations} />
      {world.landmark && <CentralLandmark radius={world.landmark.radius} />}
      {world.stations.map((station) => (
        <group key={`fixture-${station.zone}`}>
          <StationPedestal x={station.x} z={station.z} color={station.color} />
          {station.kind === 'portal' && <PortalGate x={station.x} z={station.z} color={station.color} />}
        </group>
      ))}
      <VehicleMesh />
    </group>
  );
}