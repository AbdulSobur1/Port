'use client';

/**
 * The player vehicle — a hand-modelled contemporary electric sports coupé.
 *
 * ORIENTATION CONTRACT
 * --------------------
 * The simulation moves the car along its heading `(sin yaw, cos yaw)` (see
 * `physics.ts`). This model is authored to match exactly: at `yaw = 0` the **nose
 * points +Z** and the tail −Z, so the car drives nose-first and the chase camera
 * sits behind the tail. (The previous primitive model was authored 180° the wrong
 * way round and drove tail-first.) The car is built from `y = 0` (the road) up so
 * the tyres contact the ground precisely.
 *
 * The visible model is decoupled from the physics body (see `physics.ts`
 * `VEHICLE_SAMPLES`): the body is ~4.4 × 1.9 m, represented in physics by three
 * 0.8 m circles laid along the heading.
 */

import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { vehicle as vehicleState } from './store';
import { Glow } from './atmosphere';

const LIME = '#d8f851';
const CYAN = '#6de0dd';

const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.27;
const STEER_LIMIT = 0.5;
const TRACK = 0.9;
const FRONT_AXLE = 1.35;
const REAR_AXLE = -1.4;

/* --------------------------------------------------------------- geometry --- */

/** Loft a side-profile (x = length, +x = nose; y = height) across the car's width. */
function extrudeProfile(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const depth = Math.max(0.04, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2); // shape +x (nose) becomes world +z
  geo.computeVertexNormals();
  return geo;
}

/** Low, wide coupé body: long hood, high shoulder line, short rear deck. */
function bodySilhouette(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-2.16, 0.34); // rear bumper underside
  s.lineTo(-2.2, 0.52);
  s.quadraticCurveTo(-2.16, 0.74, -1.92, 0.82); // rear deck lip
  s.quadraticCurveTo(-1.1, 0.9, -0.5, 0.93); // rear haunch
  s.quadraticCurveTo(0.35, 0.94, 1.0, 0.86); // shoulder line to hood
  s.quadraticCurveTo(1.72, 0.78, 2.06, 0.64); // hood falls to nose
  s.quadraticCurveTo(2.2, 0.56, 2.2, 0.44); // nose
  s.quadraticCurveTo(2.2, 0.34, 2.14, 0.3); // front bumper
  s.lineTo(2.04, 0.22);
  s.quadraticCurveTo(0.4, 0.16, -0.9, 0.18); // flat underbody
  s.quadraticCurveTo(-1.7, 0.2, -2.16, 0.34);
  return s;
}

/** Fastback greenhouse (glazing + roof volume). */
function cabinSilhouette(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.66, 0.86); // windscreen base
  s.quadraticCurveTo(0.4, 1.12, 0.06, 1.2); // A-pillar
  s.lineTo(-0.66, 1.19); // roof
  s.quadraticCurveTo(-1.14, 1.08, -1.52, 0.88); // C-pillar
  s.lineTo(-1.52, 0.84);
  s.lineTo(0.66, 0.84);
  return s;
}

const geo = {
  body: extrudeProfile(bodySilhouette(), 1.86, 0.06),
  cabin: extrudeProfile(cabinSilhouette(), 1.5, 0.04),
  arch: new THREE.TorusGeometry(0.46, 0.052, 8, 26, Math.PI).rotateY(Math.PI / 2),
  tyre: new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 28).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(0.235, 0.23, WHEEL_WIDTH + 0.01, 24).rotateZ(Math.PI / 2),
  hub: new THREE.CylinderGeometry(0.07, 0.07, WHEEL_WIDTH + 0.03, 14).rotateZ(Math.PI / 2),
  disc: new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20).rotateZ(Math.PI / 2),
  spoke: new THREE.BoxGeometry(0.055, 0.4, 0.06),
  caliper: new THREE.BoxGeometry(0.07, 0.16, 0.12),
};

/* -------------------------------------------------------------- materials --- */

const mat = {
  paint: new THREE.MeshPhysicalMaterial({ color: LIME, roughness: 0.22, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1 }),
  dark: new THREE.MeshPhysicalMaterial({ color: '#0b1415', roughness: 0.3, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#0a1416', roughness: 0.06, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.62 }),
  trim: new THREE.MeshStandardMaterial({ color: '#0e1416', roughness: 0.42, metalness: 0.55 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0a0b0c', roughness: 0.9, metalness: 0.02 }),
  rim: new THREE.MeshStandardMaterial({ color: '#c9d3d0', roughness: 0.22, metalness: 0.95 }),
  disc: new THREE.MeshStandardMaterial({ color: '#59615e', roughness: 0.45, metalness: 0.7 }),
  caliper: new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.35, metalness: 0.4, emissive: '#4a5a12', emissiveIntensity: 0.3 }),
  head: new THREE.MeshStandardMaterial({ color: '#f4fff2', emissive: '#eaffd2', emissiveIntensity: 2.6 }),
  tail: new THREE.MeshStandardMaterial({ color: '#ff5a4d', emissive: '#ff2a1a', emissiveIntensity: 2.0 }),
  drl: new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.6 }),
};

/* ------------------------------------------------------------------ wheel --- */

/** Caliper (fixed) + spinning tyre/rim/disc assembly, in the wheel's local frame. */
function WheelAssembly({ spinRef }: { spinRef: (node: THREE.Group | null) => void }) {
  return (
    <>
      <mesh position={[0, 0.05, -WHEEL_RADIUS * 0.5]}>
        <boxGeometry args={[0.07, 0.16, 0.12]} />
        <primitive object={mat.caliper} attach="material" />
      </mesh>
      <group ref={spinRef}>
        <mesh geometry={geo.tyre} material={mat.rubber} castShadow />
        <mesh geometry={geo.disc} material={mat.disc} />
        <mesh geometry={geo.rim} material={mat.rim} />
        <mesh geometry={geo.hub} material={mat.trim} />
        {[0, 1, 2, 3, 4].map((n) => (
          <mesh key={n} geometry={geo.spoke} material={mat.rim} rotation={[(n / 5) * Math.PI * 2, 0, 0]} />
        ))}
      </group>
    </>
  );
}

/* --------------------------------------------------------------- the car ---- */

export function VehicleMesh() {
  const shell = useRef<THREE.Group>(null);
  const bodyShell = useRef<THREE.Group>(null);
  const steerRefs = useRef<(THREE.Group | null)[]>([]);
  const spinRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((_, delta) => {
    const v = vehicleState;
    const dt = Math.min(delta, 0.05);
    const rate = (v.speed * dt) / WHEEL_RADIUS;

    const outer = shell.current;
    if (outer) {
      outer.position.set(v.x, 0, v.z);
      outer.rotation.y = v.yaw;
    }
    const body = bodyShell.current;
    if (body) {
      body.rotation.z = THREE.MathUtils.clamp(-v.steer * v.speed * 0.012, -0.05, 0.05);
      body.rotation.x = THREE.MathUtils.clamp(-v.speed * 0.004, -0.02, 0.02);
    }

    for (const w of spinRefs.current) if (w) w.rotation.x += rate;
    const steerAngle = -v.steer * STEER_LIMIT;
    for (let i = 0; i < 2; i++) {
      const s = steerRefs.current[i];
      if (s) s.rotation.y = steerAngle;
    }
  });

  const axles: ReadonlyArray<{ x: number; z: number; front: boolean }> = [
    { x: -TRACK, z: FRONT_AXLE, front: true },
    { x: TRACK, z: FRONT_AXLE, front: true },
    { x: -TRACK, z: REAR_AXLE, front: false },
    { x: TRACK, z: REAR_AXLE, front: false },
  ];

  return (
    <group ref={shell}>
      <group ref={bodyShell}>
        {/* body + glass */}
        <mesh geometry={geo.body} material={mat.paint} castShadow receiveShadow />
        <mesh geometry={geo.cabin} material={mat.glass} />
        <mesh position={[0, 1.2, -0.28]} material={mat.paint}>
          <boxGeometry args={[1.28, 0.07, 1.24]} />
        </mesh>

        {/* fender arches */}
        {axles.map((a, i) => (
          <mesh key={`arch-${i}`} geometry={geo.arch} material={mat.trim} position={[a.x, WHEEL_RADIUS, a.z]} />
        ))}

        {/* skirts, splitter, diffuser */}
        <mesh position={[-0.93, 0.16, -0.05]} material={mat.dark}>
          <boxGeometry args={[0.06, 0.12, 2.5]} />
        </mesh>
        <mesh position={[0.93, 0.16, -0.05]} material={mat.dark}>
          <boxGeometry args={[0.06, 0.12, 2.5]} />
        </mesh>
        <mesh position={[0, 0.2, 2.05]} material={mat.dark}>
          <boxGeometry args={[1.72, 0.05, 0.4]} />
        </mesh>
        <mesh position={[0, 0.24, -2.0]} material={mat.dark}>
          <boxGeometry args={[1.6, 0.18, 0.42]} />
        </mesh>
        {[-0.5, 0, 0.5].map((x) => (
          <mesh key={`fin-${x}`} position={[x, 0.22, -2.0]} material={mat.trim}>
            <boxGeometry args={[0.03, 0.16, 0.4]} />
          </mesh>
        ))}

        {/* ducktail spoiler */}
        <mesh position={[0, 0.88, -2.02]} material={mat.paint}>
          <boxGeometry args={[1.48, 0.06, 0.3]} />
        </mesh>

        {/* mirrors */}
        <mesh position={[-1.0, 0.92, 0.5]} material={mat.trim}>
          <boxGeometry args={[0.18, 0.09, 0.13]} />
        </mesh>
        <mesh position={[1.0, 0.92, 0.5]} material={mat.trim}>
          <boxGeometry args={[0.18, 0.09, 0.13]} />
        </mesh>

        {/* lighting */}
        <mesh position={[0, 0.62, 2.14]} material={mat.head}>
          <boxGeometry args={[1.34, 0.06, 0.06]} />
        </mesh>
        {[-0.72, 0.72].map((x) => (
          <mesh key={`drl-${x}`} position={[x, 0.6, 2.12]} material={mat.drl}>
            <boxGeometry args={[0.05, 0.2, 0.05]} />
          </mesh>
        ))}
        <mesh position={[0, 0.76, -2.2]} material={mat.tail}>
          <boxGeometry args={[1.5, 0.07, 0.05]} />
        </mesh>
        <Glow x={-0.55} y={0.62} z={2.16} color="#eaffd2" size={1.3} opacity={0.5} />
        <Glow x={0.55} y={0.62} z={2.16} color="#eaffd2" size={1.3} opacity={0.5} />
        <Glow x={0} y={0.76} z={-2.2} color="#ff5a4d" size={1.6} opacity={0.42} />
        <Glow x={-0.9} y={0.16} z={-0.05} color={CYAN} size={0.7} opacity={0.35} />
        <Glow x={0.9} y={0.16} z={-0.05} color={CYAN} size={0.7} opacity={0.35} />
      </group>

      {/* wheels (kept out of the rolling shell so they stay on the ground) */}
      <group>
        {axles.map((a, i) => {
          const assembly = <WheelAssembly spinRef={(node) => { spinRefs.current[i] = node; }} />;
          return (
            <group key={`wheel-${i}`} position={[a.x, WHEEL_RADIUS, a.z]}>
              {a.front ? (
                <group ref={(node) => { steerRefs.current[i] = node; }}>{assembly}</group>
              ) : (
                assembly
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}
