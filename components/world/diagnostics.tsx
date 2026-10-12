'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

type PerfSample = { fps: number; calls: number; tris: number; renderer: string; dpr: number };

/** Live numbers written each second by the in-canvas probe, read by the DOM overlay. */
export const perfSample: PerfSample = { fps: 0, calls: 0, tris: 0, renderer: '', dpr: 1 };

/** Samples FPS / draw calls / triangles / GPU name once a second (cheap, always mounted). */
export function PerfProbe() {
  const { gl } = useThree();
  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, dt) => {
    elapsed.current += dt;
    frames.current += 1;
    if (elapsed.current < 1) return;

    const ctx = gl.getContext();
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    perfSample.fps = Math.round(frames.current / elapsed.current);
    perfSample.calls = gl.info.render.calls;
    perfSample.tris = gl.info.render.triangles;
    perfSample.dpr = gl.getPixelRatio();
    perfSample.renderer = dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    frames.current = 0;
    elapsed.current = 0;
  });

  return null;
}

export function PerfOverlay() {
  const [sample, setSample] = useState<PerfSample>(perfSample);
  useEffect(() => {
    const id = setInterval(() => setSample({ ...perfSample }), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="world-debug" aria-hidden="true">
      <span>~{sample.fps} fps</span>
      <span>{sample.calls} calls</span>
      <span>{Math.round(sample.tris / 1000)}k tris</span>
      <span>dpr {sample.dpr.toFixed(2)}</span>
      <span className="world-debug__gpu">{sample.renderer}</span>
    </div>
  );
}
