'use client';

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { vehicle as vehicleState } from './store';
import type { BuildingSpec, WorldLayout } from './world-layout';
import { Atmosphere as SkyRig, Glow } from './atmosphere';
import { MAP_SPAN_METERS } from './geo';

const LIME = '#d8f851';
const CYAN = '#6de0dd';
const INK = '#0b1415';

function HubFloor({ showBase }: { showBase: boolean }) {
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

  return (
    <group>
      {showBase && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
          <planeGeometry args={[64, 64]} />
          <meshStandardMaterial color="#101a19" roughness={0.98} metalness={0.02} />
        </mesh>
      )}
      {/* The main streets frame the plaza instead of covering it with a debug grid. */}
      {[0, -9.1, 9.1].map((x) => (
        <group key={`road-x-${x}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.075, 0]} receiveShadow>
            <planeGeometry args={[x === 0 ? 5.5 : 3.2, 48]} />
            <meshStandardMaterial color={x === 0 ? '#182322' : '#151f1e'} roughness={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x + (x === 0 ? 2.85 : 1.7), -0.055, 0]}>
            <planeGeometry args={[0.09, 48]} />
            <meshBasicMaterial color="#6c8378" transparent opacity={0.32} />
          </mesh>
        </group>
      ))}
      {[0, -9.1, 9.1].map((z) => (
        <group key={`road-z-${z}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, z]} receiveShadow>
            <planeGeometry args={[48, z === 0 ? 5.5 : 3.2]} />
            <meshStandardMaterial color={z === 0 ? '#182322' : '#151f1e'} roughness={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, z + (z === 0 ? 2.85 : 1.7)]}>
            <planeGeometry args={[48, 0.09]} />
            <meshBasicMaterial color="#6c8378" transparent opacity={0.32} />
          </mesh>
        </group>
      ))}
      {roadMarks.map((mark, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, mark.rotation]} position={[mark.x, -0.045, mark.z]}>
          <planeGeometry args={[0.075, mark.length]} />
          <meshBasicMaterial color="#d0d5c5" transparent opacity={0.35} />
        </mesh>
      ))}
      {/* Inlaid plaza rings guide the eye toward the central landmark. */}
      {[5.2, 6.1, 13.8, 14.1, 17.2].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035 + i * 0.001, 0]}>
          <ringGeometry args={[r, r + (i === 2 ? 0.12 : 0.035), 128]} />
          <meshBasicMaterial color={i === 2 ? LIME : '#52716a'} transparent opacity={i === 2 ? 0.24 : 0.2} />
        </mesh>
      ))}
      {/* Subtle plaza tile seams */}
      {Array.from({ length: 13 }, (_, i) => i - 6).map((n) => (
        <group key={`tile-${n}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[n * 2.2, -0.03, 0]}>
            <planeGeometry args={[0.018, 12]} />
            <meshBasicMaterial color="#45605a" transparent opacity={0.3} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, -0.029, n * 2.2]}>
            <planeGeometry args={[0.018, 12]} />
            <meshBasicMaterial color="#45605a" transparent opacity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A simpler city floor: ground plane, a ring road around the landmark, and a north-south lane. */
function DistrictFloor({ world, showBase }: { world: WorldLayout; showBase: boolean }) {
  const radius = world.landmark ? world.landmark.radius + 2.2 : 4;
  return (
    <group>
      {showBase && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
          <planeGeometry args={[64, 64]} />
          <meshStandardMaterial color="#101a19" roughness={0.98} metalness={0.02} />
        </mesh>
      )}
      {/* North–south arterial from the spawn gate toward the centre. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]} receiveShadow>
        <planeGeometry args={[6, 64]} />
        <meshStandardMaterial color="#182322" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.9, -0.05, 0]}>
        <planeGeometry args={[0.09, 64]} />
        <meshBasicMaterial color="#6c8378" transparent opacity={0.32} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.9, -0.05, 0]}>
        <planeGeometry args={[0.09, 64]} />
        <meshBasicMaterial color="#6c8378" transparent opacity={0.32} />
      </mesh>
      {/* Roundabout ring around the landmark integrates the arterial with the streets. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.062, 0]} receiveShadow>
        <ringGeometry args={[radius, radius + 5.6, 128]} />
        <meshStandardMaterial color="#151f1e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[radius, radius + 0.1, 128]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.048, 0]}>
        <ringGeometry args={[radius + 5.5, radius + 5.6, 128]} />
        <meshBasicMaterial color="#6c8378" transparent opacity={0.32} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => i).map((i) => {
        const angle = (i / 24) * Math.PI * 2;
        const markRadius = radius + 2.75;
        return (
          <mesh key={i} rotation={[0, -angle, 0]} position={[Math.sin(angle) * (markRadius - 0.6), -0.045, Math.cos(angle) * (markRadius + 0.6)]}>
            <boxGeometry args={[0.075, 0.02, 1.05]} />
            <meshBasicMaterial color="#d0d5c5" transparent opacity={0.3} />
          </mesh>
        );
      })}
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
      <meshBasicMaterial color="#d0d5c5" transparent opacity={0.34} />
    </mesh>
  );
}

function GroundDetails({ world }: { world: WorldLayout }) {
  if (world.id === 'hub') {
    const roads = [0, -9.1, 9.1];
    return (
      <group>
        {roads.map((x) => {
          const half = (x === 0 ? 5.5 : 3.2) / 2;
          return (
            <group key={`curb-${x}`}>
              {[half + 0.13, -(half + 0.13)].map((off) => (
                <mesh key={off} position={[x + off, 0.09, 0]} receiveShadow>
                  <boxGeometry args={[0.22, 0.18, 48]} />
                  <meshStandardMaterial color="#2b3835" roughness={0.9} metalness={0.06} />
                </mesh>
              ))}
            </group>
          );
        })}
        <Crossings distance={7} roadWidth={5.5} />
        {/* Crosswalk at the arrival plaza */}
        <group position={[0, 0, 14]}>
          {Array.from({ length: 7 }, (_, i) => i - 3).map((n) => (
            <mesh key={n} position={[n * 0.7, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.42, 2.6]} />
              <meshBasicMaterial color="#cfd6c8" transparent opacity={0.5} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }
  const radius = world.landmark ? world.landmark.radius + 2.2 : 4;
  return (
    <group>
      {[3.13, -3.13].map((off) => (
        <mesh key={off} position={[off, 0.09, 0]} receiveShadow>
          <boxGeometry args={[0.22, 0.18, 64]} />
          <meshStandardMaterial color="#2b3835" roughness={0.9} metalness={0.06} />
        </mesh>
      ))}
      <Crossings distance={radius + 6.7} roadWidth={6} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.14, 128]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 5.5, radius + 5.64, 128]} />
        <meshBasicMaterial color="#6c8378" transparent opacity={0.3} />
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
        <meshStandardMaterial color="#384542" roughness={0.88} />
      </mesh>
      <mesh position={[0, h / 2 + 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={tint} roughness={0.72} metalness={0.22} />
      </mesh>
      {/* Recessed-looking window bays, merged into three meshes per building to keep the
          draw-call count low (there can be ~60 windows per facade). */}
      {windowGeoms.panes && (
        <mesh geometry={windowGeoms.panes}>
          <meshStandardMaterial color="#101c1c" emissive="#213b37" emissiveIntensity={0.16} roughness={0.3} metalness={0.35} />
        </mesh>
      )}
      {windowGeoms.accents && (
        <mesh geometry={windowGeoms.accents}>
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.65} roughness={0.3} metalness={0.35} />
        </mesh>
      )}
      {windowGeoms.sills && (
        <mesh geometry={windowGeoms.sills}>
          <meshStandardMaterial color="#43534e" metalness={0.55} roughness={0.45} />
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
            <meshStandardMaterial color="#172321" metalness={0.45} roughness={0.6} />
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
          <meshStandardMaterial color="#101a19" metalness={0.55} roughness={0.4} />
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
        <meshStandardMaterial color="#111b1a" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.59, d / 2 + 0.09]}>
        <planeGeometry args={[w * 0.6, 0.15]} />
        <meshBasicMaterial color={accent} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function StreetLamp({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.09, 3.2, 8]} />
        <meshStandardMaterial color="#3d4d47" metalness={0.72} roughness={0.3} />
      </mesh>
      <mesh position={[0.28, 3.08, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.72, 0.07, 0.1]} />
        <meshStandardMaterial color="#52645a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0.58, 3.0, 0]}>
        <boxGeometry args={[0.3, 0.12, 0.22]} />
        <meshStandardMaterial color="#e5f7be" emissive="#d8f851" emissiveIntensity={2.2} />
      </mesh>
      <Glow x={0.58} y={2.98} z={0} color="#f4ffcc" size={2.8} opacity={0.5} />
    </group>
  );
}

function PlanterTree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.68, 0.78, 0.36, 8]} />
        <meshStandardMaterial color="#26332e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.48, 0.57, 0.18, 8]} />
        <meshStandardMaterial color="#4c5b4e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.15, 1.95, 7]} />
        <meshStandardMaterial color="#57483a" roughness={1} />
      </mesh>
      <mesh position={[0, 2.45, 0]} castShadow>
        <icosahedronGeometry args={[0.86, 1]} />
        <meshStandardMaterial color="#2d5141" roughness={0.92} />
      </mesh>
      <mesh position={[0.28, 2.72, -0.12]} castShadow>
        <icosahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial color="#3b694b" roughness={0.92} />
      </mesh>
      <mesh position={[-0.26, 2.35, 0.18]} castShadow>
        <icosahedronGeometry args={[0.46, 1]} />
        <meshStandardMaterial color="#244b3c" roughness={0.92} />
      </mesh>
    </group>
  );
}

function UrbanDetails({ world }: { world: WorldLayout }) {
  return (
    <group>
      {world.lampPositions.map(([x, z], i) => <StreetLamp key={`lamp-${i}`} x={x} z={z} rotation={i % 2 ? Math.PI : 0} />)}
      {world.treePositions.map(([x, z, scale], i) => <PlanterTree key={`tree-${i}`} x={x} z={z} scale={scale} />)}
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
            <meshStandardMaterial color="#2b3a37" roughness={0.9} metalness={0.08} />
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
        <meshStandardMaterial color="#172321" metalness={0.5} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[2.9, 3.05, 0.08, 64]} />
        <meshStandardMaterial color="#35463e" metalness={0.4} roughness={0.4} />
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

function StationPad({ x, z, color }: { x: number; z: number; color: string }) {
  const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ring.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.5 + x + z) * 0.025;
      ring.current.scale.setScalar(pulse);
    }
  });
  return (
    <group position={[x, 0.035, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.25, 64]} />
        <meshStandardMaterial color="#14211e" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.85, 1.94, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.72, 0.78, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.38} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * Math.PI / 2) * 2.05, 0.08, Math.sin(i * Math.PI / 2) * 2.05]}>
          <boxGeometry args={[0.12, 0.16, 0.12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function StationPedestal({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.72, 1.3, 8]} />
        <meshStandardMaterial color="#1a2926" metalness={0.72} roughness={0.3} />
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

/* ---------- Player vehicle ---------- */
const vehGeo = {
  body: new THREE.BoxGeometry(1.18, 0.34, 1.95),
  cabin: new THREE.BoxGeometry(0.8, 0.31, 0.92),
  wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16),
};
const paint = new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.28, metalness: 0.38 });
const cabinMat = new THREE.MeshPhysicalMaterial({ color: '#12201f', metalness: 0.45, roughness: 0.19, clearcoat: 0.9, clearcoatRoughness: 0.18 });
const wheelMat = new THREE.MeshStandardMaterial({ color: '#090e0d', roughness: 0.85 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#6b9c92', metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.72, clearcoat: 1 });

function VehicleMesh() {
  const group = useRef<THREE.Group>(null!);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const v = vehicleState;
    if (!group.current) return;
    group.current.position.set(v.x, 0.2, v.z);
    group.current.rotation.y = v.yaw;
    const roll = v.speed * Math.min(dt, 0.05) * (1 / 0.17);
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x -= roll;
  });
  const wheelPositions: [number, number, number][] = [
    [-0.63, -0.12, -0.58], [0.63, -0.12, -0.58], [-0.63, -0.12, 0.63], [0.63, -0.12, 0.63],
  ];
  return (
    <group ref={group}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow geometry={vehGeo.body} material={paint} />
      <mesh position={[0, 0.45, -0.2]} castShadow geometry={vehGeo.cabin} material={cabinMat} />
      <mesh position={[0, 0.48, 0.24]} geometry={new THREE.BoxGeometry(0.66, 0.2, 0.12)} material={glassMat} />
      <mesh position={[0, 0.45, -0.64]} geometry={new THREE.BoxGeometry(0.66, 0.17, 0.1)} material={glassMat} />
      <mesh position={[0, 0.15, -1.01]}>
        <boxGeometry args={[0.78, 0.08, 0.035]} />
        <meshBasicMaterial color="#f2f0d9" />
      </mesh>
      <mesh position={[0, 0.15, 1.01]}>
        <boxGeometry args={[0.72, 0.07, 0.035]} />
        <meshBasicMaterial color="#ff7863" />
      </mesh>
      {wheelPositions.map((p, i) => (
        <group key={i} position={p}>
          <mesh ref={(node) => { wheels.current[i] = node; }} rotation={[0, 0, Math.PI / 2]} geometry={vehGeo.wheel} material={wheelMat} />
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.085, 0.085, 0.148, 12]} />
            <meshStandardMaterial color="#65716a" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.24, -0.72]}>
        <boxGeometry args={[0.84, 0.055, 0.055]} />
        <meshStandardMaterial color="#27342d" metalness={0.6} roughness={0.25} />
      </mesh>
      <Glow x={-0.4} y={0.3} z={-1.18} color="#eef7d0" size={1.1} opacity={0.5} />
      <Glow x={0.4} y={0.3} z={-1.18} color="#eef7d0" size={1.1} opacity={0.5} />
      <Glow x={0} y={0.32} z={1.02} color="#ff5a4d" size={1.4} opacity={0.4} />
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
      <pointLight position={[-12, 8, -8]} intensity={7} color="#477c80" distance={26} />
      <pointLight position={[12, 7, 12]} intensity={5} color="#7766b0" distance={22} />
      <MapPlane texture={mapTexture} />
      {world.id === 'hub' ? <HubFloor showBase={!hasMap} /> : <DistrictFloor world={world} showBase={!hasMap} />}
      <GroundDetails world={world} />
      <CitySkirt world={world} show={!hasMap} />
      {world.buildings.map((spec, index) => <Building key={`${spec.x}-${spec.z}`} spec={spec} index={index} />)}
      <PerimeterWall world={world} />
      <UrbanDetails world={world} />
      {world.landmark && <CentralLandmark radius={world.landmark.radius} />}
      {world.stations.map((station) => (
        <group key={station.zone}>
          <StationPad x={station.x} z={station.z} color={station.color} />
          <StationPedestal x={station.x} z={station.z} color={station.color} />
          {station.kind === 'portal' && <PortalGate x={station.x} z={station.z} color={station.color} />}
        </group>
      ))}
      <VehicleMesh />
    </group>
  );
}