'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { vehicle as vehicleState } from './store';

/** Speed-aware chase camera with smooth follow, look-ahead, and gentle recovery after sharp turns. */
export function ChaseCamera({ active }: { active: boolean }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const smoothedSpeed = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const v = vehicleState;
    smoothedSpeed.current = THREE.MathUtils.damp(smoothedSpeed.current, Math.abs(v.speed), 3.2, dt);

    if (!active) return;

    const speedRatio = THREE.MathUtils.clamp(smoothedSpeed.current / 13, 0, 1);
    const followDistance = THREE.MathUtils.lerp(7.2, 9.8, speedRatio);
    const followHeight = THREE.MathUtils.lerp(4.5, 6.1, speedRatio);
    const behind = v.yaw + Math.PI;
    desired.set(
      v.x + Math.sin(behind) * followDistance,
      followHeight,
      v.z + Math.cos(behind) * followDistance
    );

    // Faster catch-up at speed prevents the vehicle from leaving the frame during turns.
    const followAlpha = 1 - Math.exp(-THREE.MathUtils.lerp(3.5, 2.1, speedRatio) * dt);
    camera.position.lerp(desired, followAlpha);

    // Look slightly ahead of the vehicle along its heading. Deriving this from yaw (a
    // smooth value) instead of the raw per-frame position delta avoids jitter.
    const ahead = 1.1 + speedRatio * 2.1;
    look.set(
      v.x + Math.sin(v.yaw) * ahead,
      0.95 + speedRatio * 0.25,
      v.z + Math.cos(v.yaw) * ahead
    );
    camera.lookAt(look);
  });

  return null;
}
