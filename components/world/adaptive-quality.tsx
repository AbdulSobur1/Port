'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Lightweight stand-in for drei's PerformanceMonitor: samples average FPS once per second
 * and asks the host to drop or restore quality after a sustained trend. Keeping this local
 * lets the whole @react-three/drei package stay out of the bundle.
 */
export function AdaptiveQuality({ onDecline, onIncline }: { onDecline: () => void; onIncline: () => void }) {
  const frames = useRef(0);
  const elapsed = useRef(0);
  const lowStreak = useRef(0);
  const highStreak = useRef(0);

  useFrame((_, dt) => {
    elapsed.current += dt;
    frames.current += 1;
    if (elapsed.current < 1) return;

    const fps = frames.current / elapsed.current;
    frames.current = 0;
    elapsed.current = 0;

    if (fps < 46) {
      lowStreak.current += 1;
      highStreak.current = 0;
    } else if (fps > 57) {
      highStreak.current += 1;
      lowStreak.current = 0;
    } else {
      lowStreak.current = 0;
      highStreak.current = 0;
    }

    if (lowStreak.current >= 3) {
      lowStreak.current = 0;
      onDecline();
    }
    if (highStreak.current >= 8) {
      highStreak.current = 0;
      onIncline();
    }
  });

  return null;
}
