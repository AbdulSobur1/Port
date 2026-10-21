'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildBuildingMeshes } from '@/lib/world/geometry';
import type { ProjectBuilding } from '@/lib/world/project-buildings';
import { concreteTexture, facadeTexture, glassTexture, labelTexture, shopSignTexture } from './textures';
import { toGeometry } from './city';

/**
 * The nine addresses on the main street.
 *
 * Each is a purpose-built shop / studio / gallery rather than an OSM extrusion:
 * a real shopfront band, recessed entrance with steps, projecting awning, a
 * sign carrying the project name and street address, a lit interior visible
 * through the glass, and a forecourt with two perpendicular parking bays.
 *
 * The shell reuses the architectural mesh builder (parapets, cornices, roof
 * clutter) so the new buildings sit in the same material language as the
 * surveyed city around them. Everything is deterministic from the placement
 * module: the sign, the collision footprint and the map polygon describe the
 * same rectangle.
 */

type Arrays = ReturnType<typeof buildBuildingMeshes>;

function mergeArrays(parts: Arrays[]): Arrays {
  const out: Arrays = {
    walls: { position: [], normal: [], uv: [], color: [] },
    glass: { position: [], normal: [], uv: [], color: [] },
    trim: { position: [], normal: [], uv: [], color: [] },
    roofs: { position: [], normal: [], uv: [], color: [] },
    clutter: { position: [], normal: [], uv: [], color: [] },
  };
  for (const part of parts) {
    for (const key of Object.keys(out) as (keyof Arrays)[]) {
      out[key].position.push(...part[key].position);
      out[key].normal.push(...part[key].normal);
      out[key].uv.push(...part[key].uv);
      out[key].color.push(...part[key].color);
    }
  }
  return out;
}

const FLOOR_H = 3.15;

export function ProjectBuildings({
  buildings,
  onSelect,
}: {
  buildings: ProjectBuilding[];
  onSelect?: (zone: string) => void;
}) {
  const merged = useMemo(
    () => mergeArrays(buildings.map((b) => buildBuildingMeshes([{ h: b.height, p: b.footprint }]))),
    [buildings]
  );
  const walls = useMemo(() => toGeometry(merged.walls), [merged]);
  const glass = useMemo(() => toGeometry(merged.glass), [merged]);
  const trim = useMemo(() => toGeometry(merged.trim), [merged]);
  const roofs = useMemo(() => toGeometry(merged.roofs), [merged]);
  const clutter = useMemo(() => toGeometry(merged.clutter), [merged]);
  const concrete = useMemo(() => concreteTexture(), []);
  const facade = useMemo(() => facadeTexture(), []);
  const windowGlass = useMemo(() => glassTexture(), []);

  return (
    <group>
      <mesh geometry={walls} castShadow receiveShadow>
        <meshStandardMaterial map={facade} vertexColors roughness={0.84} metalness={0.04} envMapIntensity={0.7} />
      </mesh>
      <mesh geometry={glass} castShadow receiveShadow>
        <meshStandardMaterial map={windowGlass} vertexColors roughness={0.22} metalness={0.6} envMapIntensity={1.5} />
      </mesh>
      <mesh geometry={trim} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.78} metalness={0.06} />
      </mesh>
      <mesh geometry={roofs} castShadow receiveShadow>
        <meshStandardMaterial map={concrete} vertexColors roughness={0.96} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={clutter} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.88} />
      </mesh>
      {buildings.map((b) => (
        <BuildingAddress key={b.zone} building={b} onSelect={onSelect} />
      ))}
      <ParkedCars buildings={buildings} />
    </group>
  );
}

/** One shopfront: glass, door, awning, sign, interior light and forecourt paving. */
function BuildingAddress({
  building,
  onSelect,
}: {
  building: ProjectBuilding;
  onSelect?: (zone: string) => void;
}) {
  const sign = useMemo(
    () => shopSignTexture(building.label, building.address, building.color),
    [building.label, building.address, building.color]
  );
  const pylonLabel = useMemo(
    () => labelTexture(building.label, building.address, building.color),
    [building.label, building.address, building.color]
  );
  const { front, yaw, width, height } = building;
  const facing = Math.atan2(front.nx, front.nz);
  const alongX = Math.sin(yaw);
  const alongZ = Math.cos(yaw);
  const outward = (distance: number) => ({
    x: front.x + front.nx * distance,
    z: front.z + front.nz * distance,
  });
  const at = (distance: number, along: number) => {
    const p = outward(distance);
    return [p.x + alongX * along, 0, p.z + alongZ * along] as [number, number, number];
  };

  const glassWidth = Math.min(width * 0.78, 12);
  const glassCentreX = -width * 0.12;

  return (
    <group>
      {/* Route-end ring on the carriageway: where the autopilot stops. */}
      <mesh
        position={[building.roadPoint.x, 0.112, building.roadPoint.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[2.05, 2.26, 48]} />
        <meshBasicMaterial color={building.color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Kerbside wayfinding pylon, in front of the entrance. */}
      <group position={[building.pylon.x, 0, building.pylon.z]}>
        <mesh position={[0, 1.15, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.11, 2.3, 8]} />
          <meshStandardMaterial color="#1c2526" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 2.42, 0]}>
          <boxGeometry args={[0.84, 0.06, 0.24]} />
          <meshStandardMaterial color={building.color} emissive={building.color} emissiveIntensity={1.1} />
        </mesh>
        <sprite position={[0, 3.0, 0]} scale={[3.5, 1.09, 1]}>
          <spriteMaterial map={pylonLabel} transparent depthWrite={false} />
        </sprite>
        {onSelect && (
          <mesh
            position={[0, 1.4, 0]}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(building.zone);
            }}
          >
            <cylinderGeometry args={[1.7, 1.7, 3.2, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>

      {/* Ground-floor shopfront glazing, slightly proud of the shell. */}
      <mesh position={at(0.09, glassCentreX).map((v, i) => (i === 1 ? 1.7 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <planeGeometry args={[glassWidth, 2.35]} />
        <meshPhysicalMaterial
          color="#0c1a1c"
          roughness={0.08}
          metalness={0.55}
          transparent
          opacity={0.82}
          envMapIntensity={1.7}
        />
      </mesh>
      {/* Lit interior: a warm slab and two shelves, visible through the glass. */}
      <mesh position={at(-0.55, glassCentreX).map((v, i) => (i === 1 ? 1.7 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <planeGeometry args={[glassWidth * 0.94, 2.3]} />
        <meshStandardMaterial color="#c8a56a" emissive="#f4c079" emissiveIntensity={0.72} roughness={0.9} />
      </mesh>
      {[0.85, 1.5].map((y) => (
        <mesh key={`shelf-${y}`} position={at(-0.3, glassCentreX).map((v, i) => (i === 1 ? y : v)) as [number, number, number]} rotation={[0, facing, 0]}>
          <boxGeometry args={[glassWidth * 0.7, 0.08, 0.34]} />
          <meshStandardMaterial color="#2b2b26" roughness={0.8} />
        </mesh>
      ))}
      {/* Mullions break the glazing into bays. */}
      {[-0.34, 0, 0.34].map((t) => (
        <mesh key={`mullion-${t}`} position={at(0.13, glassCentreX + glassWidth * t).map((v, i) => (i === 1 ? 1.7 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
          <boxGeometry args={[0.07, 2.4, 0.09]} />
          <meshStandardMaterial color="#1a2222" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* Recessed entrance + two steps. */}
      <mesh position={at(0.11, width * 0.3).map((v, i) => (i === 1 ? 1.2 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <boxGeometry args={[1.55, 2.4, 0.1]} />
        <meshStandardMaterial color="#10191a" roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={at(0.42, width * 0.3).map((v, i) => (i === 1 ? 0.09 : v)) as [number, number, number]} rotation={[0, facing, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.18, 0.9]} />
        <meshStandardMaterial color="#b9b6a9" roughness={0.9} />
      </mesh>
      <mesh position={at(0.9, width * 0.3).map((v, i) => (i === 1 ? 0.04 : v)) as [number, number, number]} rotation={[0, facing, 0]} receiveShadow>
        <boxGeometry args={[2.5, 0.08, 0.55]} />
        <meshStandardMaterial color="#a8a79c" roughness={0.94} />
      </mesh>
      {/* Door canopy, in the project colour. */}
      <mesh position={at(0.75, width * 0.3).map((v, i) => (i === 1 ? 2.62 : v)) as [number, number, number]} rotation={[0, facing, 0]} castShadow>
        <boxGeometry args={[2.3, 0.1, 1.15]} />
        <meshStandardMaterial color={building.color} roughness={0.55} metalness={0.15} />
      </mesh>

      {/* Projecting awning over the shopfront. */}
      <mesh position={at(0.72, glassCentreX).map((v, i) => (i === 1 ? 2.98 : v)) as [number, number, number]} rotation={[0, facing, 0]} castShadow>
        <boxGeometry args={[glassWidth + 1.1, 0.12, 1.42]} />
        <meshStandardMaterial color={building.color} roughness={0.72} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={at(1.35, glassCentreX).map((v, i) => (i === 1 ? 2.86 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <boxGeometry args={[glassWidth + 1.1, 0.24, 0.06]} />
        <meshStandardMaterial color="#141c1c" roughness={0.6} />
      </mesh>

      {/* Sign board: the project name and its street address. */}
      <mesh position={at(0.2, 0).map((v, i) => (i === 1 ? 3.95 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <planeGeometry args={[Math.min(width * 0.78, 9.4), 1.28]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={at(0.16, 0).map((v, i) => (i === 1 ? 3.95 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <boxGeometry args={[Math.min(width * 0.8, 9.6), 1.42, 0.06]} />
        <meshStandardMaterial color="#0d1414" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Coloured parapet band, so the address reads from down the street. */}
      <mesh position={at(-0.02, 0).map((v, i) => (i === 1 ? height - 0.34 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
        <boxGeometry args={[width + 0.12, 0.34, 0.1]} />
        <meshStandardMaterial color={building.color} emissive={building.color} emissiveIntensity={0.32} roughness={0.5} />
      </mesh>

      {/* Entrance planters. */}
      {[-1, 1].map((s) => {
        const along = width * 0.3 + s * 1.9;
        return (
          <group key={`planter-${s}`} position={at(1.05, along).map((v, i) => (i === 1 ? 0.3 : v)) as [number, number, number]} rotation={[0, facing, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.8, 0.6, 0.8]} />
              <meshStandardMaterial color="#8c8779" roughness={0.94} />
            </mesh>
            <mesh position={[0, 0.55, 0]} castShadow>
              <icosahedronGeometry args={[0.5, 1]} />
              <meshStandardMaterial color="#3c5a31" roughness={0.9} flatShading />
            </mesh>
          </group>
        );
      })}

      {/* Forecourt paving and parking bay markings. */}
      <group position={[building.x, 0, building.z]} rotation={[0, yaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0.4]} receiveShadow>
          <planeGeometry args={[width + 5.2, Math.max(4, building.frontOffset + 1)]} />
          <meshStandardMaterial color="#6d6f66" roughness={0.96} />
        </mesh>
        {building.parked.length > 0 && (
          <>
            {building.parked.map((car, i) => {
              const along = i === 0 ? -width / 2 + 2.3 : width / 2 - 2.3;
              return (
                <group key={`bay-${i}`}>
                  {[-1.05, 1.05].map((offset) => (
                    <mesh key={offset} position={[along + offset, 0.032, -building.depth / 2 - 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.1, 5]} />
                      <meshBasicMaterial color="#d9d7c8" />
                    </mesh>
                  ))}
                  <mesh position={[along, 0.032, -building.depth / 2 - 5.05]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[2.1, 0.1]} />
                    <meshBasicMaterial color="#d9d7c8" />
                  </mesh>
                </group>
              );
            })}
          </>
        )}
      </group>
    </group>
  );
}

/** Two parked cars per address, instanced so the whole row is three draw calls. */
function ParkedCars({ buildings }: { buildings: ProjectBuilding[] }) {
  const cars = useMemo(() => buildings.flatMap((b) => b.parked), [buildings]);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const cabins = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const paints = ['#b9c2c0', '#38505a', '#8d3c32', '#c9c3ac', '#2c3a33'];

  useLayoutEffect(() => {
    const body = bodies.current;
    const cabin = cabins.current;
    const wheel = wheels.current;
    if (!body || !cabin || !wheel) return;
    const wheelOffsets: [number, number][] = [
      [-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35],
    ];
    cars.forEach((car, i) => {
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      dummy.position.set(car.x, 0.62, car.z);
      dummy.rotation.set(0, car.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      body.setColorAt(i, new THREE.Color(paints[i % paints.length]));

      dummy.position.set(car.x + s * -0.18, 1.06, car.z + c * -0.18);
      dummy.updateMatrix();
      cabin.setMatrixAt(i, dummy.matrix);
      cabin.setColorAt(i, new THREE.Color('#111b1d'));

      wheelOffsets.forEach(([x, z], k) => {
        dummy.position.set(car.x + x * c + z * s, 0.33, car.z - x * s + z * c);
        dummy.rotation.set(0, car.yaw, Math.PI / 2);
        dummy.updateMatrix();
        wheel.setMatrixAt(i * 4 + k, dummy.matrix);
      });
    });
    body.count = cars.length;
    cabin.count = cars.length;
    wheel.count = cars.length * 4;
    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    wheel.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (cabin.instanceColor) cabin.instanceColor.needsUpdate = true;
  }, [cars, dummy]);

  if (!cars.length) return null;
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, cars.length]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.62, 4.45]} />
        <meshStandardMaterial roughness={0.36} metalness={0.45} vertexColors={false} />
      </instancedMesh>
      <instancedMesh ref={cabins} args={[undefined, undefined, cars.length]} castShadow>
        <boxGeometry args={[1.68, 0.52, 2.1]} />
        <meshStandardMaterial roughness={0.18} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={wheels} args={[undefined, undefined, Math.max(1, cars.length * 4)]} castShadow>
        <cylinderGeometry args={[0.33, 0.33, 0.22, 14]} />
        <meshStandardMaterial color="#111414" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
