'use client';

import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { stations, vehicle as vehicleState } from './store';

/* ---------- City fabric ---------- */

const GRID = [-10, -5, 0, 5, 10];
const GRID_EDGE = [-9.5, -4.5, 4.5, 9.5];

function WorldFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0b1415" roughness={0.96} metalness={0.1} />
      </mesh>
      {GRID.map((g) => (
        <group key={`g-${g}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[g, 0.02, 0]}>
            <planeGeometry args={[1.6, 60]} />
            <meshBasicMaterial color="#1c3536" transparent opacity={0.66} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, g]}>
            <planeGeometry args={[60, 1.6]} />
            <meshBasicMaterial color="#1c3536" transparent opacity={0.66} />
          </mesh>
        </group>
      ))}
      {GRID_EDGE.map((g) => (
        <group key={`e-${g}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[g, 0.03, 0]}>
            <planeGeometry args={[0.06, 60]} />
            <meshBasicMaterial color="#47a8aa" transparent opacity={0.34} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, g]}>
            <planeGeometry args={[60, 0.06]} />
            <meshBasicMaterial color="#47a8aa" transparent opacity={0.34} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type TowerSpec = {
  position: [number, number];
  height: number;
  width: number;
  depth: number;
  color: string;
  roof: 'spire' | 'beacon' | 'dish';
};

const towers: TowerSpec[] = [
  { position: [7.2, 7.2], height: 6.5, width: 1.5, depth: 1.5, color: '#594d95', roof: 'beacon' },
  { position: [10.5, 6.8], height: 4.8, width: 1.4, depth: 1.4, color: '#2e6870', roof: 'dish' },
  { position: [-7.5, 7.5], height: 5.2, width: 1.5, depth: 1.5, color: '#2d6670', roof: 'spire' },
  { position: [-10.8, 6.2], height: 4.2, width: 1.4, depth: 1.4, color: '#4c4379', roof: 'dish' },
  { position: [-7.0, -8.0], height: 6.8, width: 1.6, depth: 1.5, color: '#2f6871', roof: 'spire' },
  { position: [-10.2, -7.5], height: 4.4, width: 1.4, depth: 1.4, color: '#4b4b83', roof: 'beacon' },
  { position: [7.0, -8.0], height: 5.6, width: 1.5, depth: 1.5, color: '#315f71', roof: 'dish' },
  { position: [10.2, -7.5], height: 4.6, width: 1.4, depth: 1.4, color: '#275e67', roof: 'spire' },
];

function Tower({ spec }: { spec: TowerSpec }) {
  const roofY = spec.height / 2 + 0.18;
  return (
    <group position={[spec.position[0], spec.height / 2, spec.position[1]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[spec.width, spec.height, spec.depth]} />
        <meshStandardMaterial color="#132023" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, spec.depth / 2 + 0.015]}>
        <planeGeometry args={[spec.width * 0.7, spec.height * 0.66]} />
        <meshBasicMaterial color={spec.color} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, roofY, 0]}>
        <boxGeometry args={[spec.width * 0.8, 0.12, spec.depth * 0.8]} />
        <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={0.9} />
      </mesh>
      {spec.roof === 'spire' && (
        <mesh position={[0, roofY + 0.55, 0]}>
          <coneGeometry args={[0.2, 1.0, 5]} />
          <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={1.2} />
        </mesh>
      )}
      {spec.roof === 'beacon' && <Beacon y={roofY + 0.45} />}
      {spec.roof === 'dish' && (
        <mesh position={[0, roofY + 0.3, 0]} rotation={[0.35, 0, 0]}>
          <sphereGeometry args={[0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={spec.color} metalness={0.85} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}

function Beacon({ y }: { y: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    const pulse = 1.1 + Math.sin(clock.elapsedTime * 2.2) * 0.35;
    if (mat.current) mat.current.emissiveIntensity = pulse;
    if (light.current) light.current.intensity = pulse * 2.2;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.44, 12]} />
        <meshStandardMaterial ref={mat} color="#d8f851" emissive="#d8f851" emissiveIntensity={1.2} />
      </mesh>
      <pointLight ref={light} color="#d8f851" intensity={2.4} distance={4} />
    </group>
  );
}

function Centerpiece() {
  const core = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (core.current) {
      core.current.rotation.y = clock.elapsedTime * 0.35;
      core.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.6) * 0.03);
    }
  });
  return (
    <group position={[0, 2.6, 0]}>
      <mesh ref={core}>
        <dodecahedronGeometry args={[1.15, 1]} />
        <meshStandardMaterial color="#e5ebe5" emissive="#d8f851" emissiveIntensity={0.6} metalness={0.4} roughness={0.3} />
      </mesh>
      <pointLight color="#d8f851" intensity={18} distance={12} />
    </group>
  );
}

function StationPad({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0.04, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.7, 1.85, 56]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.5, 0.62, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function StationPedestal({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.55, 1.7, 6]} />
        <meshStandardMaterial color="#172526" metalness={0.7} roughness={0.28} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} />
      </mesh>
    </group>
  );
}

/* ---------- Player vehicle ---------- */

const vehGeo = {
  body: new THREE.BoxGeometry(1.15, 0.34, 1.9),
  cabin: new THREE.BoxGeometry(0.78, 0.3, 0.85),
  wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.14, 14),
};

const paint = new THREE.MeshStandardMaterial({ color: '#d8f851', roughness: 0.35, metalness: 0.25 });
const cabinMat = new THREE.MeshStandardMaterial({ color: '#10191a', metalness: 0.15, roughness: 0.4 });
const wheelMat = new THREE.MeshStandardMaterial({ color: '#0b0f10', roughness: 0.85 });

function VehicleMesh() {
  const group = useRef<THREE.Group>(null!);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  const lastYaw = useRef(0);

  useFrame((_, dt) => {
    const v = vehicleState;
    if (!group.current) return;
    group.current.position.set(v.x, 0, v.z);
    group.current.rotation.y = v.yaw;
    // wheels roll with distance travelled, turn with steering
    const roll = v.speed * Math.min(dt, 0.05) * (1 / 0.17);
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x -= roll;
    }
    lastYaw.current = v.yaw;
  });

  const wheelPositions: [number, number, number][] = [
    [-0.62, -0.16, -0.55],
    [0.62, -0.16, -0.55],
    [-0.62, -0.16, 0.62],
    [0.62, -0.16, 0.62],
  ];

  return (
    <group ref={group}>
      <mesh castShadow geometry={vehGeo.body} material={paint} />
      <mesh position={[0, 0.31, -0.2]} geometry={vehGeo.cabin} material={cabinMat} />
      {wheelPositions.map((p, i) => (
        <mesh
          key={i}
          ref={(node) => {
            wheels.current[i] = node;
          }}
          position={p}
          rotation={[0, 0, Math.PI / 2]}
          geometry={vehGeo.wheel}
          material={wheelMat}
        />
      ))}
      <pointLight position={[0, 0.8, -1.2]} color="#d8f851" intensity={0.9} distance={3.2} />
    </group>
  );
}

export function World() {
  return (
    <group>
      <fog attach="fog" args={['#09100f', 18, 46]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[9, 14, 7]}
        intensity={1.25}
        color="#edf7ee"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 5, 0]} intensity={24} color="#d8f851" distance={14} />
      <WorldFloor />
      {towers.map((t) => (
        <Tower key={`${t.position[0]}|${t.position[1]}`} spec={t} />
      ))}
      <Centerpiece />
      {stations.map((s) => (
        <group key={s.zone}>
          <StationPad x={s.x} z={s.z} color={s.color} />
          <StationPedestal x={s.x} z={s.z} color={s.color} />
        </group>
      ))}
      <VehicleMesh />
    </group>
  );
}
