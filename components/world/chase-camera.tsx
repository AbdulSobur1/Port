'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { vehicle as vehicleState } from './store';

/**
 * Smooth chase camera. Reads simulation state through a ref each frame —
 * never causes React re-renders.
 */
export function ChaseCamera({ active }: { active: boolean }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const v = vehicleState;
    if (active) {
      const behind = v.yaw + Math.PI;
      desired.set(
        v.x + Math.sin(behind) * 8.5,
        5.4,
        v.z + Math.cos(behind) * 8.5
      );
      camera.position.lerp(desired, Math.min(1, dt * 3.2));
      look.set(v.x, 1.1, v.z);
      camera.lookAt(look);
    }
  });
  return null;
}
