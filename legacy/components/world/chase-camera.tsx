'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from './store';

/**
 * Chase camera: trails the car at a speed-dependent distance, looks through
 * the corner ahead rather than at the bumper, and widens the lens slightly at
 * speed. Damping is frame-rate independent (exponential smoothing), and with
 * reduced motion enabled the camera snaps instead of gliding.
 */
export function ChaseCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const look = useRef(new THREE.Vector3());
  const initialised = useRef(false);

  useFrame((_, dtRaw) => {
    const car = runtime.current?.car;
    if (!car) return;
    const dt = Math.min(0.05, dtRaw);
    const speed = Math.abs(car.speed);
    const fast = Math.min(1, speed / 22);

    const back = 7.4 + fast * 2.8;
    const height = 2.65 + fast * 1.0;
    // A little shoulder offset: a dead-centre chase camera flattens the car
    // into a rear silhouette and hides its wheels. The offset is proportional
    // to speed so it opens up in corners without feeling like a turntable.
    const lateral = 0.95 + fast * 0.35;
    const targetX = car.x - Math.sin(car.yaw) * back + Math.cos(car.yaw) * lateral;
    const targetZ = car.z - Math.cos(car.yaw) * back - Math.sin(car.yaw) * lateral;

    if (!initialised.current) {
      camera.position.set(targetX, height, targetZ);
      initialised.current = true;
    } else {
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 5.5);
      camera.position.x += (targetX - camera.position.x) * k;
      camera.position.y += (height - camera.position.y) * k;
      camera.position.z += (targetZ - camera.position.z) * k;
    }

    look.current.set(
      car.x + Math.sin(car.yaw) * (5.5 + fast * 5) + Math.cos(car.yaw) * 0.4,
      1.3,
      car.z + Math.cos(car.yaw) * (5.5 + fast * 5) - Math.sin(car.yaw) * 0.4
    );
    camera.lookAt(look.current);

    const fov = 54 + fast * 7;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (reducedMotion ? 1 : Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
