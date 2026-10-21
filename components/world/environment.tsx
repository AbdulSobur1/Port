'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { skyTexture } from './textures';
import { runtime } from './store';

const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.34).normalize();

/**
 * Late-afternoon tropical light: a warm low sun, a hazy horizon and a sky
 * used as the image-based light so glass, paint and water all pick up the same
 * environment. Nothing here is a downloaded HDRI, so the scene has no asset
 * licensing surface and no multi-megabyte texture fetch.
 */
export function SceneEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const tex = skyTexture();
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.62;
    // The same equirectangular sky is the visible background, so the horizon in
    // the distance matches the haze the buildings fade into instead of leaving
    // a dark page background behind a warm afternoon city.
    scene.background = tex;
    scene.backgroundIntensity = 1.02;
    pmrem.dispose();
    return () => {
      env.dispose();
      tex.dispose();
      scene.environment = null;
      scene.background = null;
    };
  }, [gl, scene]);

  return (
    <>
      <fogExp2 attach="fog" args={['#c3cdc8', 0.00072]} />
      <hemisphereLight args={['#c8dce6', '#45463a', 0.42]} />
      <SunLight />
    </>
  );
}

function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useFrame(() => {
    const car = runtime.current?.car;
    if (!light.current || !target.current || !car) return;
    // The shadow camera is small and follows the car, which buys crisp
    // near-field shadows across the compact neighbourhood instead of a blurry
    // district-sized shadow map.
    light.current.position.set(car.x + SUN_DIR.x * 140, SUN_DIR.y * 140, car.z + SUN_DIR.z * 140);
    target.current.position.set(car.x, 0, car.z);
    target.current.updateMatrixWorld();
  });

  return (
    <>
      <directionalLight
        ref={light}
        castShadow
        color="#ffe3b8"
        intensity={2.05}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.05}
        shadow-camera-near={1}
        shadow-camera-far={420}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
      />
      <object3D ref={target} />
    </>
  );
}
