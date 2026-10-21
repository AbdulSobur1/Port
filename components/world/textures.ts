'use client';

import * as THREE from 'three';

/**
 * Procedural textures. Everything here is generated in the browser from code
 * — no third-party image assets, no licensing questions, no network fetch —
 * and the geometry they sit on is real OSM data. Where a photo texture would
 * look better (asphalt aggregate), the noise is fine-grained enough to read
 * as material rather than pattern.
 */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [el, ctx];
}

function noise(ctx: CanvasRenderingContext2D, size: number, alpha: number, scale = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha * scale;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function finish(el: HTMLCanvasElement, repeat: number, anisotropy = 4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let asphalt: THREE.CanvasTexture | null = null;
export function asphaltTexture(): THREE.CanvasTexture {
  if (asphalt) return asphalt;
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#6f716d';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 0.55);
  // Aggregate speckles and a couple of tar seams.
  for (let i = 0; i < 900; i++) {
    const g = 90 + Math.random() * 70;
    ctx.fillStyle = `rgba(${g},${g},${g - 4},${0.25 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 40 + Math.random() * 40);
  ctx.bezierCurveTo(80, 60, 170, 30, 256, 70);
  ctx.stroke();
  asphalt = finish(el, 12);
  return asphalt;
}

let concrete: THREE.CanvasTexture | null = null;
export function concreteTexture(): THREE.CanvasTexture {
  if (concrete) return concrete;
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#b4b0a6';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 0.28);
  ctx.strokeStyle = 'rgba(90,88,82,0.5)';
  for (let i = 0; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  concrete = finish(el, 3);
  return concrete;
}

let grass: THREE.CanvasTexture | null = null;
export function groundTexture(): THREE.CanvasTexture {
  if (grass) return grass;
  const [el, ctx] = canvas(512);
  ctx.fillStyle = '#5d6147';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 3 + Math.random() * 26;
    const g = 70 + Math.random() * 40;
    ctx.fillStyle = `rgba(${g - 22},${g},${Math.round(g * 0.72)},${0.05 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, 512, 0.16);
  grass = finish(el, 90, 8);
  return grass;
}

let waterNormal: THREE.CanvasTexture | null = null;
export function waterNormalTexture(): THREE.CanvasTexture {
  if (waterNormal) return waterNormal;
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 256, 256);
  // Soft horizontal ripples: a normal map with banded slope noise.
  for (let y = 0; y < 256; y += 2) {
    const slope = (Math.sin(y * 0.13) * 0.5 + Math.sin(y * 0.41 + 1.7) * 0.35) * 40;
    const r = 128 + slope;
    const g = 128 + Math.cos(y * 0.09) * 18;
    ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},255)`;
    ctx.fillRect(0, y, 256, 2);
  }
  noise(ctx, 256, 0.1);
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  waterNormal = tex;
  return tex;
}

let facade: THREE.CanvasTexture | null = null;
/**
 * One facade tile = 2 windows over 7.2 m of wall × 1 floor (3.3 m).
 * Buildings map UVs in world metres, so the tile repeats at a real scale.
 */
export function facadeTexture(): THREE.CanvasTexture {
  if (facade) return facade;
  const W = 256, H = 128;
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Two windows with reveals, sills and a hint of reflected sky.
  for (const [x, w] of [[28, 70], [158, 70]] as [number, number][]) {
    ctx.fillStyle = '#d8d8d4';
    ctx.fillRect(x - 6, 22, w + 12, 84);
    const grad = ctx.createLinearGradient(x, 26, x, 100);
    grad.addColorStop(0, '#5f7c86');
    grad.addColorStop(0.35, '#33484f');
    grad.addColorStop(0.75, '#1c2a30');
    grad.addColorStop(1, '#141e23');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 26, w, 78);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(x, 26);
    ctx.lineTo(x + w * 0.55, 26);
    ctx.lineTo(x + w * 0.18, 104);
    ctx.lineTo(x, 104);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(230,232,228,0.9)';
    ctx.fillRect(x, 104, w, 5);
    ctx.fillStyle = 'rgba(10,16,18,0.5)';
    ctx.fillRect(x + w / 2 - 1.5, 26, 3, 78);
  }
  // Storey band
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillStyle = 'rgba(120,118,110,0.35)';
  ctx.fillRect(0, H - 5, W, 5);

  facade = new THREE.CanvasTexture(el);
  facade.wrapS = THREE.RepeatWrapping;
  facade.wrapT = THREE.RepeatWrapping;
  facade.anisotropy = 8;
  facade.colorSpace = THREE.SRGBColorSpace;
  return facade;
}

/**
 * Curtain-wall tile for towers: 8 m wide × 4 m high, with dark spandrel bands,
 * slim mullions and a sky gradient. It is deliberately low-contrast so the
 * building still reads as a volume rather than a stripe pattern.
 */
let glass: THREE.CanvasTexture | null = null;
export function glassTexture(): THREE.CanvasTexture {
  if (glass) return glass;
  const W = 256, H = 256;
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#6d8f99');
  grad.addColorStop(0.42, '#3f5f69');
  grad.addColorStop(0.7, '#2c464f');
  grad.addColorStop(1, '#243b44');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Four window bays per tile, with a spandrel at the bottom of each floor.
  for (let i = 0; i < 4; i++) {
    const x = i * 64;
    ctx.fillStyle = 'rgba(10,20,24,0.42)';
    ctx.fillRect(x + 4, 0, 3, H);
    ctx.fillStyle = 'rgba(190,215,220,0.12)';
    ctx.fillRect(x + 9, 0, 8, H);
    ctx.fillStyle = 'rgba(8,16,19,0.55)';
    ctx.fillRect(x + 4, H - 34, 57, 34);
  }
  ctx.fillStyle = 'rgba(190,205,205,0.18)';
  ctx.fillRect(0, 0, W, 4);
  ctx.fillStyle = 'rgba(10,18,20,0.45)';
  ctx.fillRect(0, H - 5, W, 5);

  glass = new THREE.CanvasTexture(el);
  glass.wrapS = THREE.RepeatWrapping;
  glass.wrapT = THREE.RepeatWrapping;
  glass.anisotropy = 8;
  glass.colorSpace = THREE.SRGBColorSpace;
  return glass;
}

/** Equirectangular sky for image-based lighting + background. */
export function skyTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5d89a8');
  grad.addColorStop(0.42, '#a8c6d4');
  grad.addColorStop(0.52, '#e2ded2');
  grad.addColorStop(0.6, '#b9b8ac');
  grad.addColorStop(1, '#6d736c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Hazy sun low in the west, matching the directional light.
  const sun = ctx.createRadialGradient(W * 0.26, H * 0.36, 8, W * 0.26, H * 0.36, 190);
  sun.addColorStop(0, 'rgba(255,246,220,1)');
  sun.addColorStop(0.12, 'rgba(255,238,198,0.72)');
  sun.addColorStop(0.45, 'rgba(255,228,188,0.18)');
  sun.addColorStop(1, 'rgba(255,228,188,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // Thin tropical cloud bands.
  for (let i = 0; i < 26; i++) {
    const y = 40 + Math.random() * 170;
    const x = Math.random() * W;
    const w = 90 + Math.random() * 260;
    const h = 8 + Math.random() * 22;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(el);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Label sprite for a destination, drawn once per station. */
/**
 * Shop sign for a project building: name, street address and a colour bar.
 * Rectangular because it is applied to a vertical board, not a billboard
 * sprite. Kept as a canvas texture so the address on the building is the same
 * string the dossier and the map show.
 */
export function shopSignTexture(title: string, address: string, color: string): THREE.CanvasTexture {
  const el = document.createElement('canvas');
  el.width = 1024;
  el.height = 256;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#0d1414';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 18, 256);
  ctx.fillRect(18, 226, 1006, 10);
  ctx.fillStyle = '#f2f7ef';
  ctx.font = '600 112px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const label = title.length > 16 ? `${title.slice(0, 15)}…` : title;
  ctx.fillText(label, 62, 108);
  ctx.fillStyle = 'rgba(230,239,232,0.62)';
  ctx.font = '400 44px ui-monospace, monospace';
  ctx.fillText(address.toUpperCase(), 64, 188);
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function labelTexture(title: string, subtitle: string, color: string): THREE.CanvasTexture {
  const W = 512, H = 160;
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(7,14,15,0.82)';
  roundRect(ctx, 6, 26, W - 12, 104, 14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '600 30px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.toUpperCase(), 34, 66);
  ctx.fillStyle = 'rgba(210,220,214,0.86)';
  ctx.font = '400 21px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(subtitle, 34, 104);

  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
