'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundTexture, waterNormalTexture, concreteTexture } from './textures';

/**
 * Ground, lagoon and parks.
 *
 * Water polygons come from the vector-tile build (scripts/extract-water-from-tiles.mjs)
 * because the Lagos Lagoon/Atlantic multipolygons extend beyond the extraction
 * rectangle; parks come straight from the OSM landuse/leisure extraction. The
 * sea is not invented — if the archive is missing, the scene renders plain
 * land and the UI says so.
 */

function polygonsToGeometry(polygons: number[][]): THREE.BufferGeometry | null {
  if (!polygons.length) return null;
  const shapes: THREE.Shape[] = [];
  for (const poly of polygons) {
    if (poly.length < 6) continue;
    const shape = new THREE.Shape();
    // Shape is authored in (x, -z) and rotated +90° about X so the y-up world
    // keeps OSM's north (+Z) pointing north.
    shape.moveTo(poly[0], -poly[1]);
    for (let i = 2; i < poly.length; i += 2) shape.lineTo(poly[i], -poly[i + 1]);
    shape.closePath();
    shapes.push(shape);
  }
  if (!shapes.length) return null;
  const geometries: THREE.BufferGeometry[] = [];
  for (const s of shapes) {
    try {
      geometries.push(new THREE.ShapeGeometry(s, 1));
    } catch {
      /* degenerate ring: skip */
    }
  }
  if (!geometries.length) return null;
  // Merge manually: avoids pulling BufferGeometryUtils into the bundle.
  let total = 0;
  for (const g of geometries) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx: number[] = [];
  let positionOffset = 0;
  let uvOffset = 0;
  let vertexOffset = 0;
  for (const g of geometries) {
    const p = g.attributes.position.array as Float32Array;
    const u = g.attributes.uv?.array as Float32Array | undefined;
    const count = g.attributes.position.count;
    pos.set(p, positionOffset);
    if (u) uv.set(u, uvOffset);
    const index = g.index;
    if (index) {
      for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < count; i++) idx.push(i + vertexOffset);
    }
    positionOffset += p.length;
    uvOffset += u ? u.length : 0;
    vertexOffset += count;
    g.dispose();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  geom.rotateX(-Math.PI / 2);
  return geom;
}

export function Ground({ size }: { size: { width: number; depth: number } }) {
  const tex = useMemo(() => groundTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[size.width + 6000, size.depth + 6000]} />
      <meshStandardMaterial map={tex} color="#8d9479" roughness={0.97} metalness={0} />
    </mesh>
  );
}

export function WaterSurface({ polygons }: { polygons: number[][] }) {
  const geometry = useMemo(() => polygonsToGeometry(polygons), [polygons]);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const normalMap = useMemo(() => waterNormalTexture(), []);

  useFrame((_, dt) => {
    if (!material.current?.normalMap) return;
    const map = material.current.normalMap;
    map.offset.x = (map.offset.x + dt * 0.004) % 1;
    map.offset.y = (map.offset.y + dt * 0.002) % 1;
  });

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, 0.06, 0]} receiveShadow>
      <meshStandardMaterial
        ref={material}
        color="#1f4a55"
        roughness={0.12}
        metalness={0.42}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.55, 0.55)}
        envMapIntensity={1.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function Parks({ polygons }: { polygons: number[][] }) {
  const geometry = useMemo(() => polygonsToGeometry(polygons), [polygons]);
  const tex = useMemo(() => {
    const t = groundTexture().clone();
    t.repeat.set(2, 2);
    t.needsUpdate = true;
    return t;
  }, []);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, 0.045, 0]} receiveShadow>
      <meshStandardMaterial map={tex} color="#5f7448" roughness={0.96} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Raised kerb ring for the extraction edge, so the world has a visible limit. */
export function WorldEdge({ bounds }: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }) {
  const tex = useMemo(() => concreteTexture(), []);
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (
    <group>
      {[
        { x: cx, z: bounds.minZ, sx: w, sz: 1.2 },
        { x: cx, z: bounds.maxZ, sx: w, sz: 1.2 },
        { x: bounds.minX, z: cz, sx: 1.2, sz: d },
        { x: bounds.maxX, z: cz, sx: 1.2, sz: d },
      ].map((seg, i) => (
        <mesh key={i} position={[seg.x, 0.3, seg.z]} castShadow receiveShadow>
          <boxGeometry args={[seg.sx, 0.6, seg.sz]} />
          <meshStandardMaterial map={tex} color="#6a6a62" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
