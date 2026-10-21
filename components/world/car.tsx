'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { bodyAttitude } from '@/lib/world/vehicle';
import {
  vehicleById,
  type BodyStyle,
  type VehicleDefinition,
} from '@/lib/world/vehicles';
import { input, runtime, useUi } from './store';

/**
 * Parametric, catalogue-driven car.
 *
 * The body is assembled from a handful of rounded volumes whose proportions
 * come from the selected vehicle: overall length/width/height, wheelbase, wheel
 * radius, cabin position and ride height. That is enough to make the hatch,
 * saloon, SUV, coupé and van read as different vehicles rather than one mesh in
 * five colours, while staying stable at any camera angle.
 *
 * There is no third-party GLB. The catalogue states this, the selection screen
 * repeats it, and no real marque is claimed.
 */

type BodyShape = {
  /** Cabin length as a fraction of overall length. */
  cabin: number;
  /** Cabin offset toward the rear, fraction of length (negative = rear). */
  cabinZ: number;
  /** Body height fraction before the cabin. */
  shoulder: number;
  /** Extra ground clearance, fraction of height. */
  ride: number;
  /** Bonnet length fraction. */
  bonnet: number;
  spoiler?: boolean;
};

const SHAPES: Record<BodyStyle, BodyShape> = {
  hatch: { cabin: 0.5, cabinZ: -0.06, shoulder: 0.52, ride: 0.09, bonnet: 0.24 },
  sedan: { cabin: 0.46, cabinZ: -0.03, shoulder: 0.5, ride: 0.09, bonnet: 0.3 },
  coupe: { cabin: 0.38, cabinZ: -0.08, shoulder: 0.47, ride: 0.075, bonnet: 0.36, spoiler: true },
  suv: { cabin: 0.52, cabinZ: 0.02, shoulder: 0.54, ride: 0.15, bonnet: 0.24 },
  van: { cabin: 0.62, cabinZ: 0.06, shoulder: 0.6, ride: 0.13, bonnet: 0.14 },
};

type Refs = {
  bodyRef?: React.RefObject<THREE.Group | null>;
  steerRefs?: React.MutableRefObject<(THREE.Group | null)[]>;
  spinRefs?: React.MutableRefObject<(THREE.Group | null)[]>;
  brakeMat?: React.RefObject<THREE.MeshStandardMaterial | null>;
};

export function CarModel({
  vehicle,
  refs,
  shadows = true,
}: {
  vehicle: VehicleDefinition;
  refs?: Refs;
  shadows?: boolean;
}) {
  const { length, width, height, wheelbase, wheelRadius } = vehicle.dimensions;
  const shape = SHAPES[vehicle.body];

  const paint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: vehicle.paint.base,
        metalness: 0.42,
        roughness: 0.3,
        clearcoat: 0.9,
        clearcoatRoughness: 0.16,
        envMapIntensity: 1.25,
      }),
    [vehicle.paint.base]
  );
  const accent = useMemo(
    () => new THREE.MeshStandardMaterial({ color: vehicle.paint.accent, roughness: 0.55, metalness: 0.3 }),
    [vehicle.paint.accent]
  );
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0b171a',
        metalness: 0.6,
        roughness: 0.08,
        envMapIntensity: 1.8,
        side: THREE.DoubleSide,
      }),
    []
  );
  const chrome = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#aeb7b5', roughness: 0.22, metalness: 0.92 }),
    []
  );
  const rubber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0f1112', roughness: 0.94 }), []);
  const rim = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8d9695', metalness: 0.9, roughness: 0.26 }),
    []
  );
  const caliper = useMemo(
    () => new THREE.MeshStandardMaterial({ color: vehicle.paint.caliper, roughness: 0.45, metalness: 0.35 }),
    [vehicle.paint.caliper]
  );
  const lamp = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e8f1f4',
        emissive: '#d6eaff',
        emissiveIntensity: 1.4,
        roughness: 0.16,
      }),
    []
  );

  const ride = height * shape.ride;
  const bodyH = height * shape.shoulder;
  const cabinH = Math.max(0.34, height - ride - bodyH);
  const bodyY = ride + bodyH / 2;
  const cabinY = ride + bodyH + cabinH / 2 - 0.02;
  const cabinD = length * shape.cabin;
  const cabinZ = -length * shape.cabinZ;
  const cabinW = width * (vehicle.body === 'van' ? 0.9 : 0.84);
  const bonnetD = length * shape.bonnet;
  const bonnetZ = length / 2 - bonnetD / 2;
  const tailD = length * (vehicle.body === 'van' ? 0.1 : 0.2);
  const tailZ = -length / 2 + tailD / 2;
  const roofY = ride + bodyH + cabinH;

  const wheel = (x: number, z: number, idx: number, steers: boolean) => (
    <group
      position={[x, wheelRadius, z]}
      ref={(el) => {
        if (steers && refs?.steerRefs) refs.steerRefs.current[idx] = el;
      }}
    >
      <group
        ref={(el) => {
          if (refs?.spinRefs) refs.spinRefs.current[idx] = el;
        }}
      >
        <mesh castShadow={shadows} rotation={[0, 0, Math.PI / 2]} material={rubber}>
          <cylinderGeometry args={[wheelRadius, wheelRadius, 0.24, 26]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={rim}>
          <cylinderGeometry args={[wheelRadius * 0.62, wheelRadius * 0.62, 0.25, 20]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={caliper}>
          <cylinderGeometry args={[wheelRadius * 0.36, wheelRadius * 0.36, 0.255, 12]} />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} rotation={[(i * Math.PI * 2) / 5, 0, 0]} material={rim}>
            <boxGeometry args={[0.25, wheelRadius * 0.78, wheelRadius * 0.16]} />
          </mesh>
        ))}
      </group>
      <mesh
        position={[x > 0 ? 0.03 : -0.03, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={accent}
      >
        <torusGeometry args={[wheelRadius * 1.18, 0.04, 6, 16, Math.PI]} />
      </mesh>
    </group>
  );

  return (
    <group>
      <group ref={refs?.bodyRef ?? undefined}>
        {/* Lower body: one rounded volume, wider than the cabin. */}
        <RoundedBox
          args={[width, bodyH, length]}
          radius={Math.min(0.22, bodyH * 0.4)}
          smoothness={4}
          position={[0, bodyY, 0]}
          castShadow={shadows}
          receiveShadow
          material={paint}
        />

        {/* Bonnet / nose, lower than the body on cars, nearly level on a van. */}
        <RoundedBox
          args={[width * 0.94, bodyH * 0.52, bonnetD]}
          radius={0.1}
          smoothness={3}
          position={[0, ride + bodyH * 0.76, bonnetZ]}
          castShadow={shadows}
          material={paint}
        />

        {/* Cabin: glass volume with a painted roof. */}
        <RoundedBox
          args={[cabinW, cabinH, cabinD]}
          radius={Math.min(0.16, cabinH * 0.35)}
          smoothness={4}
          position={[0, cabinY, cabinZ]}
          castShadow={shadows}
          material={glass}
        />
        <RoundedBox
          args={[cabinW * 0.94, 0.07, cabinD * 0.86]}
          radius={0.03}
          smoothness={2}
          position={[0, roofY + 0.015, cabinZ]}
          castShadow={shadows}
          material={paint}
        />

        {/* A, B and C pillars break the glasshouse into windows. */}
        {[-1, 1].map((side) => (
          <group key={`pillars-${side}`} position={[side * (cabinW / 2 + 0.005), 0, 0]}>
            {[0.42, 0, -0.42].map((t, i) => (
              <mesh key={i} position={[0, cabinY, cabinZ + cabinD * t]} material={paint} castShadow={shadows}>
                <boxGeometry args={[0.03, cabinH * 0.98, i === 1 ? 0.07 : 0.05]} />
              </mesh>
            ))}
            <mesh position={[0, cabinY - cabinH * 0.46, cabinZ]} material={chrome}>
              <boxGeometry args={[0.035, 0.03, cabinD * 0.9]} />
            </mesh>
          </group>
        ))}

        {/* Rear quarter and tail. */}
        <RoundedBox
          args={[width * 0.96, bodyH * 0.82, tailD]}
          radius={0.1}
          smoothness={3}
          position={[0, bodyY + bodyH * 0.04, tailZ]}
          castShadow={shadows}
          material={paint}
        />

        {/* Rocker, shoulder crease. */}
        <mesh position={[0, ride + bodyH * 0.1, 0]} material={accent}>
          <boxGeometry args={[width * 0.99, bodyH * 0.12, length * 0.86]} />
        </mesh>

        {/* Front: grille, splitter, headlamps. */}
        <mesh position={[0, ride + bodyH * 0.42, length / 2 + 0.005]} material={accent}>
          <boxGeometry args={[width * 0.48, bodyH * 0.26, 0.05]} />
        </mesh>
        {Array.from({ length: 4 }, (_, i) => (
          <mesh
            key={`grille-${i}`}
            position={[0, ride + bodyH * 0.32 + i * bodyH * 0.06, length / 2 + 0.03]}
            material={chrome}
          >
            <boxGeometry args={[width * 0.44, 0.014, 0.02]} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <group key={`hl-${side}`} position={[side * width * 0.33, ride + bodyH * 0.62, length / 2 - 0.015]}>
            <mesh material={lamp}>
              <boxGeometry args={[width * 0.22, bodyH * 0.14, 0.07]} />
            </mesh>
            <mesh position={[0, -bodyH * 0.09, 0.02]} material={chrome}>
              <boxGeometry args={[width * 0.24, 0.016, 0.03]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, ride + 0.02, length / 2 - 0.05]} material={accent}>
          <boxGeometry args={[width * 0.86, 0.05, 0.16]} />
        </mesh>

        {/* Rear: light bar, diffuser, plate. */}
        <mesh position={[0, ride + bodyH * 0.66, -length / 2 - 0.005]} material={accent}>
          <boxGeometry args={[width * 0.82, bodyH * 0.12, 0.04]} />
        </mesh>
        <mesh position={[0, ride + bodyH * 0.66, -length / 2 - 0.03]}>
          <boxGeometry args={[width * 0.72, bodyH * 0.05, 0.02]} />
          <meshStandardMaterial
            ref={refs?.brakeMat ?? undefined}
            color="#5c0d10"
            emissive="#ff2b32"
            emissiveIntensity={0.8}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, ride + bodyH * 0.38, -length / 2 - 0.01]}>
          <boxGeometry args={[0.44, 0.13, 0.016]} />
          <meshStandardMaterial color="#dfe4dc" roughness={0.6} />
        </mesh>
        <mesh position={[0, ride + bodyH * 0.38, length / 2 + 0.01]}>
          <boxGeometry args={[0.44, 0.13, 0.016]} />
          <meshStandardMaterial color="#dfe4dc" roughness={0.6} />
        </mesh>

        {shape.spoiler && (
          <group position={[0, ride + bodyH + 0.06, -length / 2 + 0.12]}>
            <mesh material={accent} castShadow={shadows}>
              <boxGeometry args={[width * 0.8, 0.04, 0.22]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * width * 0.32, -0.06, 0]} material={accent}>
                <boxGeometry args={[0.04, 0.14, 0.1]} />
              </mesh>
            ))}
          </group>
        )}

        {/* Door handles and mirrors. */}
        {[-1, 1].map((side) =>
          [0.24, -0.24].map((t) => (
            <mesh
              key={`handle-${side}-${t}`}
              position={[side * (width / 2 + 0.012), ride + bodyH * 0.72, length * t]}
              material={chrome}
            >
              <boxGeometry args={[0.022, 0.035, 0.17]} />
            </mesh>
          ))
        )}
        {[-1, 1].map((side) => (
          <group key={`mirror-${side}`} position={[side * (width / 2 + 0.07), cabinY - cabinH * 0.12, cabinZ + cabinD * 0.4]}>
            <mesh material={accent} castShadow={shadows}>
              <boxGeometry args={[0.2, 0.08, 0.11]} />
            </mesh>
            <mesh position={[side * 0.04, 0, -0.01]} material={glass}>
              <boxGeometry args={[0.045, 0.06, 0.09]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, roofY + 0.16, cabinZ - cabinD * 0.3]} material={accent}>
          <cylinderGeometry args={[0.011, 0.016, 0.28, 6]} />
        </mesh>
      </group>

      {wheel(-(width / 2 - 0.03), wheelbase / 2, 0, true)}
      {wheel(width / 2 - 0.03, wheelbase / 2, 1, true)}
      {wheel(-(width / 2 - 0.03), -wheelbase / 2, 2, false)}
      {wheel(width / 2 - 0.03, -wheelbase / 2, 3, false)}

      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <planeGeometry args={[width * 1.35, length * 1.12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.26} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** The car the player drives; position, attitude and wheel spin come from physics. */
export function PlayerCar() {
  const { vehicleId } = useUi();
  const vehicle = vehicleById(vehicleId);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const steerRefs = useRef<(THREE.Group | null)[]>([]);
  const spinRefs = useRef<(THREE.Group | null)[]>([]);
  const brakeMat = useRef<THREE.MeshStandardMaterial>(null);
  const prevSpeed = useRef(0);
  const roll = useRef(0);

  useFrame((_, dtRaw) => {
    const car = runtime.current?.car;
    if (!car || !group.current) return;
    const dt = Math.min(0.05, dtRaw);

    group.current.position.set(car.x, 0, car.z);
    group.current.rotation.y = car.yaw;

    const attitude = bodyAttitude(car, prevSpeed.current, dt);
    prevSpeed.current = car.speed;
    roll.current += (attitude.roll - roll.current) * Math.min(1, dt * 6);
    if (body.current) {
      body.current.rotation.x = attitude.pitch;
      body.current.rotation.z = roll.current;
      body.current.position.y = Math.sin(performance.now() * 0.006) * Math.abs(car.speed) * 0.0007;
    }

    const spin = car.distance / Math.max(0.25, vehicle.dimensions.wheelRadius);
    for (const w of spinRefs.current) if (w) w.rotation.x = -spin;
    for (const s of steerRefs.current) if (s) s.rotation.y = car.steer;

    if (brakeMat.current) {
      const braking = input.brake || car.speed < -0.3;
      brakeMat.current.emissiveIntensity = braking ? 4 : 0.8;
    }
  });

  return (
    <group ref={group}>
      <CarModel vehicle={vehicle} refs={{ bodyRef: body, steerRefs, spinRefs, brakeMat }} />
    </group>
  );
}
