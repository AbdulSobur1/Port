'use client';

/**
 * Atmosphere: a self-contained day/night lighting rig plus sky, stars, celestial
 * bodies, weather and reusable glow sprites. Deliberately dependency-free (no
 * post-processing package) — the neon feel comes from additive sprite halos and
 * `toneMapped={false}` emissives, which survive on low-end GPUs.
 */

import * as THREE from 'three';
import { useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { WorldTheme, WorldWeather } from './world-layout';
import { animateHour, samplePalette, type DayPalette } from './time-of-day';

/* ------------------------------------------------------------- glow sprites -- */

let glowTexture: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** A camera-facing additive halo. Shared by lamps, stations, portals and the landmark. */
export function Glow({ x, y, z, color, size = 2, opacity = 0.6 }: { x: number; y: number; z: number; color: string; size?: number; opacity?: number }) {
  const map = useMemo(getGlowTexture, []);
  return (
    <sprite position={[x, y, z]} scale={[size, size, 1]}>
      <spriteMaterial map={map} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
    </sprite>
  );
}

/* ------------------------------------------------------------ day/night rig -- */

/** Shared palette ref, advanced every frame; read by the lights and the sky. */
export function useDayNight(theme: WorldTheme) {
  const palette = useRef<DayPalette>(samplePalette(theme.time, theme));
  useFrame(({ clock }) => {
    palette.current = samplePalette(animateHour(theme, clock.elapsedTime), theme);
  });
  return palette;
}

function drawSky(canvas: HTMLCanvasElement, sky: DayPalette['sky']) {
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, sky.zenith);
  gradient.addColorStop(0.62, sky.zenith);
  gradient.addColorStop(0.82, sky.horizon);
  gradient.addColorStop(1, sky.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function Sky({ palette }: { palette: RefObject<DayPalette> }) {
  const group = useRef<THREE.Group>(null!);
  const sun = useRef<THREE.Sprite>(null!);
  const moon = useRef<THREE.Sprite>(null!);
  const stars = useRef<THREE.Points>(null!);

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: t };
  }, []);
  const bucket = useRef(-1);

  const starGeometry = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 62 + Math.random() * 34;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius * 0.9 + 6;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  const sunMap = useMemo(getGlowTexture, []);

  useFrame(({ camera, clock }) => {
    const p = palette.current;
    if (group.current) {
      group.current.position.set(camera.position.x, 0, camera.position.z);
      group.current.rotation.y = clock.elapsedTime * 0.004;
    }
    const nextBucket = Math.round(p.hour * 8);
    if (nextBucket !== bucket.current) {
      bucket.current = nextBucket;
      drawSky(canvas, p.sky);
      texture.needsUpdate = true;
    }
    if (sun.current) {
      sun.current.position.set(...p.sun.position);
      (sun.current.material as THREE.SpriteMaterial).opacity = Math.max(0, p.dayFactor * 1.25 - 0.05);
    }
    if (moon.current) {
      moon.current.position.set(...p.moon.position);
      (moon.current.material as THREE.SpriteMaterial).opacity = p.moon.opacity;
    }
    if (stars.current) {
      (stars.current.material as THREE.PointsMaterial).opacity = p.stars;
    }
  });

  return (
    <group ref={group}>
      <mesh renderOrder={-2} scale={[110, 110, 110]}>
        <sphereGeometry args={[1, 28, 18]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
      <points ref={stars} geometry={starGeometry} renderOrder={-1}>
        <pointsMaterial size={0.85} sizeAttenuation color="#d3e2e6" transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} />
      </points>
      <sprite ref={sun} scale={[20, 20, 1]}>
        <spriteMaterial map={sunMap} color="#ffd9a0" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false} />
      </sprite>
      <sprite ref={moon} scale={[8, 8, 1]}>
        <spriteMaterial map={sunMap} color="#cfe0ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

/* ------------------------------------------------------------------ weather -- */

function Rain({ lowPower }: { lowPower: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const count = lowPower ? 240 : 520;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const drops = useMemo(() => {
    const list: { x: number; y: number; z: number; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      list.push({ x: (Math.random() - 0.5) * 52, y: Math.random() * 18, z: (Math.random() - 0.5) * 52, speed: 14 + Math.random() * 8 });
    }
    return list;
  }, [count]);

  useFrame(({ camera }, dt) => {
    const step = Math.min(dt, 1 / 30);
    if (group.current) group.current.position.set(camera.position.x, 0, camera.position.z);
    if (!mesh.current) return;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y -= drop.speed * step;
      drop.x -= 2.4 * step;
      if (drop.y < 0) {
        drop.y = 16 + Math.random() * 3;
        drop.x = (Math.random() - 0.5) * 52;
        drop.z = (Math.random() - 0.5) * 52;
      }
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(0, 0, 0.12);
      dummy.scale.set(1, 1 + drop.speed * 0.03, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.85, 0.02]} />
        <meshBasicMaterial color="#9fb6c8" transparent opacity={0.36} depthWrite={false} fog={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Snow({ lowPower }: { lowPower: boolean }) {
  const points = useRef<THREE.Points>(null!);
  const group = useRef<THREE.Group>(null!);
  const count = lowPower ? 260 : 620;
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const spec: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 54;
      const y = Math.random() * 20;
      const z = (Math.random() - 0.5) * 54;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      spec.push({ x, y, z, phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 1.1 });
    }
    return { positions, spec };
  }, [count]);

  useFrame(({ camera, clock }, dt) => {
    const step = Math.min(dt, 1 / 30);
    const t = clock.elapsedTime;
    if (group.current) group.current.position.set(camera.position.x, 0, camera.position.z);
    if (!points.current) return;
    const array = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < data.spec.length; i++) {
      const flake = data.spec[i];
      flake.y -= flake.speed * step;
      if (flake.y < 0) { flake.y = 20; flake.x = (Math.random() - 0.5) * 54; flake.z = (Math.random() - 0.5) * 54; }
      array.setX(i, flake.x + Math.sin(t * 0.8 + flake.phase) * 0.9);
      array.setY(i, flake.y);
      array.setZ(i, flake.z);
    }
    array.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.16} sizeAttenuation color="#e6eef0" transparent opacity={0.85} depthWrite={false} fog={false} toneMapped={false} />
      </points>
    </group>
  );
}

function Weather({ weather, lowPower }: { weather: WorldWeather; lowPower: boolean }) {
  if (weather === 'rain') return <Rain lowPower={lowPower} />;
  if (weather === 'snow') return <Snow lowPower={lowPower} />;
  return null;
}

/* --------------------------------------------------------------- lighting ---- */

export function Atmosphere({ theme, lowPower = false }: { theme: WorldTheme; lowPower?: boolean }) {
  const palette = useDayNight(theme);
  const { gl } = useThree();
  const ambient = useRef<THREE.AmbientLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const sun = useRef<THREE.DirectionalLight>(null!);
  const fog = useRef<THREE.Fog>(null!);
  const shadowTick = useRef(0);

  useFrame((_, dt) => {
    const p = palette.current;
    if (ambient.current) {
      ambient.current.intensity = p.ambient.intensity;
      ambient.current.color.set(p.ambient.color);
    }
    if (hemi.current) {
      hemi.current.intensity = p.hemi.intensity;
      hemi.current.color.set(p.hemi.sky);
      hemi.current.groundColor.set(p.hemi.ground);
    }
    if (fog.current) {
      fog.current.color.set(p.fog);
      fog.current.near = theme.fog[1];
      fog.current.far = theme.fog[2];
    }

    // Colour/intensity are cheap and update every frame; the sun direction and its shadow
    // map only refresh a few times a second. The whole city sits inside the shadow frustum,
    // so the light no longer has to chase the camera.
    if (sun.current) {
      sun.current.intensity = p.sun.intensity;
      sun.current.color.set(p.sun.color);
      shadowTick.current += dt;
      if (shadowTick.current > 0.4) {
        shadowTick.current = 0;
        sun.current.position.set(...p.sun.position);
        sun.current.target.position.set(0, 0, 0);
        sun.current.target.updateMatrixWorld();
        if (gl.shadowMap.autoUpdate === false) gl.shadowMap.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={[theme.fog[0], theme.fog[1], theme.fog[2]]} />
      <ambientLight ref={ambient} intensity={theme.ambient[1]} color={theme.ambient[0]} />
      <hemisphereLight ref={hemi} args={[theme.hemisphere[0], theme.hemisphere[1], theme.hemisphere[2]]} />
      <directionalLight
        ref={sun}
        position={theme.sun.position}
        intensity={theme.sun.intensity}
        color={theme.sun.color}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0008}
      />
      <Sky palette={palette} />
      <Weather weather={theme.weather ?? 'clear'} lowPower={lowPower} />
    </>
  );
}