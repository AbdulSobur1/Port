'use client';

/**
 * Asset layer for the world: a small manifest of the CC0 glTF models, PBR
 * materials and HDRIs shipped in `public/world`, plus cache-backed loaders.
 *
 * Why not drei's `useGLTF`/`useLoader`? Those suspend, and the world's base
 * geometry lives under a single `<Suspense>`. A suspended texture/model would
 * blank the *entire* world until it loaded. Instead these hooks load through
 * plain three.js loaders and push a re-render when each resource arrives, so
 * the procedural base always renders and the photoreal layer fades in on top.
 *
 * Every asset here is CC0 1.0 (see docs/THIRD_PARTY_ASSETS.md).
 */

import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const WORLD_ASSETS_ENABLED = process.env.NEXT_PUBLIC_WORLD_ASSETS !== 'off';

const ROOT = '/world';
const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

/* --------------------------------------------------------------- models ---- */

export type ModelId =
  | 'streetLamp' | 'bench' | 'barrier' | 'hydrant' | 'planter'
  | 'planterGarden' | 'gardenBench';

type ModelDef = { url: string; /** target world height in metres */ height: number; label: string };

export const MODELS: Record<ModelId, ModelDef> = {
  streetLamp: { url: `${ROOT}/models/street_lamp_01/street_lamp_01_1k.gltf`, height: 4.35, label: 'Street lamp' },
  bench: { url: `${ROOT}/models/modular_street_seating/modular_street_seating_1k.gltf`, height: 0.92, label: 'Street seating' },
  barrier: { url: `${ROOT}/models/concrete_road_barrier/concrete_road_barrier_1k.gltf`, height: 0.82, label: 'Road barrier' },
  hydrant: { url: `${ROOT}/models/fire_hydrant/fire_hydrant_1k.gltf`, height: 0.94, label: 'Fire hydrant' },
  planter: { url: `${ROOT}/models/planter_box_01/planter_box_01_1k.gltf`, height: 0.58, label: 'Planter box' },
  planterGarden: { url: `${ROOT}/models/planter_box_02/planter_box_02_1k.gltf`, height: 0.52, label: 'Garden planter' },
  gardenBench: { url: `${ROOT}/models/painted_wooden_bench/painted_wooden_bench_1k.gltf`, height: 0.88, label: 'Painted bench' },
};

/* ------------------------------------------------------------ materials ---- */

export type MaterialId =
  | 'asphalt' | 'pavement' | 'facade' | 'concrete' | 'metal'
  | 'brick' | 'plaster' | 'tileFacade' | 'brickPath' | 'cobble';

type MaterialDef = { diff: string; nor: string; arm: string };

const materialSet = (id: string): MaterialDef => ({
  diff: `${ROOT}/materials/${id}/${id}_diff_1k.jpg`,
  nor: `${ROOT}/materials/${id}/${id}_nor_gl_1k.jpg`,
  arm: `${ROOT}/materials/${id}/${id}_arm_1k.jpg`,
});

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  asphalt: materialSet('asphalt_01'),
  pavement: materialSet('concrete_pavement_02'),
  facade: materialSet('rectangular_facade_tiles'),
  concrete: materialSet('concrete'),
  metal: materialSet('metal_plate'),
  brick: materialSet('brick_wall_001'),
  plaster: materialSet('blue_plaster_wall'),
  tileFacade: materialSet('concrete_tile_facade'),
  brickPath: materialSet('brick_pavement'),
  cobble: materialSet('cobblestone_pavement'),
};

/* ---------------------------------------------------------- environment ---- */

export const ENVIRONMENTS = {
  daylight: `${ROOT}/environment/kloofendal_43d_clear_1k.hdr`,
  dusk: `${ROOT}/environment/qwantani_dusk_1_1k.hdr`,
  night: `${ROOT}/environment/satara_night_1k.hdr`,
} as const;

/**
 * The world is bright-day, light-only by design (see docs/world-art-direction.md):
 * every city loads the same clear noon sky regardless of its nominal hour. The
 * dusk/night HDRIs stay in the manifest only as documented fallbacks and are
 * never selected by the running site.
 */
export function environmentForHour(_hour: number): string {
  return ENVIRONMENTS.daylight;
}

/* ----------------------------------------------------------------- loaders - */

/** A cache slot for one async resource (texture or model) with change subscribers. */
type Entry<T> = { resource: T | null; error?: boolean; subs: Set<() => void> };

const newEntry = <T,>(): Entry<T> => ({ resource: null, subs: new Set() });

function useLoaded<T>(entry: Entry<T>): T | null {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((v) => v + 1);
    entry.subs.add(fn);
    return () => { entry.subs.delete(fn); };
  }, [entry]);
  return entry.resource;
}

/* Textures ------------------------------------------------------------------ */

const textureEntries = new Map<string, Entry<THREE.Texture>>();
const textureLoader = new THREE.TextureLoader();

/** Textures are keyed by url + colour-space + tiling so each distinct tiling gets
 *  its own instance (repeat lives on the texture, shared by materials that match). */
function textureEntry(url: string, srgb: boolean, rx: number, ry: number): Entry<THREE.Texture> {
  const key = `${srgb ? 'srgb' : 'lin'}:${rx}:${ry}:${url}`;
  const existing = textureEntries.get(key);
  if (existing) return existing;
  const entry = newEntry<THREE.Texture>();
  textureEntries.set(key, entry);
  if (!hasDom || !url) return entry;
  textureLoader.load(
    url,
    (tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
      entry.resource = tex;
      for (const fn of entry.subs) fn();
    },
    undefined,
    () => { entry.error = true; for (const fn of entry.subs) fn(); },
  );
  return entry;
}

function useTexture(url: string, srgb: boolean, rx: number, ry: number): THREE.Texture | null {
  const entry = useMemo(() => textureEntry(url, srgb, rx, ry), [url, srgb, rx, ry]);
  return useLoaded(entry);
}

export type Repeat = number | readonly [number, number];

const repeatOf = (repeat: Repeat): readonly [number, number] =>
  typeof repeat === 'number' ? [repeat, repeat] : repeat;

/** A complete PBR material (albedo + normal + packed AO/rough/metal) or null until loaded. */
export function useMaterial(id: MaterialId, repeat: Repeat = 1): THREE.MeshStandardMaterial | null {
  const def = MATERIALS[id];
  const [rx, ry] = repeatOf(repeat);
  const diffuse = useTexture(def.diff, true, rx, ry);
  const normal = useTexture(def.nor, false, rx, ry);
  const arm = useTexture(def.arm, false, rx, ry);
  return useMemo(() => {
    if (!diffuse) return null;
    const material = new THREE.MeshStandardMaterial({
      map: diffuse,
      normalMap: normal ?? undefined,
      roughnessMap: arm ?? undefined,
      metalnessMap: arm ?? undefined,
      roughness: arm ? 1 : 0.85,
      metalness: arm ? 1 : 0.05,
    });
    material.name = `asset:${id}:${rx}:${ry}`;
    return material;
  }, [id, diffuse, normal, arm, rx, ry]);
}

/* Models -------------------------------------------------------------------- */

const modelEntries = new Map<string, Entry<THREE.Object3D>>();
const gltfLoader = new GLTFLoader();

function normalize(scene: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const wrap = new THREE.Group();
  wrap.add(scene);
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 1e-4 ? targetHeight / size.y : 1;
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  const scaled = new THREE.Box3().setFromObject(scene);
  scene.position.x -= (scaled.min.x + scaled.max.x) / 2;
  scene.position.z -= (scaled.min.z + scaled.max.z) / 2;
  scene.position.y -= scaled.min.y;

  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) {
      if (m && 'envMapIntensity' in m) (m as THREE.MeshStandardMaterial).envMapIntensity = 0.7;
    }
  });
  return wrap;
}

function modelEntry(id: ModelId): Entry<THREE.Object3D> {
  const def = MODELS[id];
  const existing = modelEntries.get(id);
  if (existing) return existing;
  const entry = newEntry<THREE.Object3D>();
  modelEntries.set(id, entry);
  if (!hasDom) return entry;
  gltfLoader.load(
    def.url,
    (gltf) => {
      try {
        entry.resource = normalize(gltf.scene, def.height);
      } catch {
        entry.error = true;
      }
      for (const fn of entry.subs) fn();
    },
    undefined,
    () => { entry.error = true; for (const fn of entry.subs) fn(); }
  );
  return entry;
}

/** Returns the shared, normalized template for a model (clone it before placing). */
export function useModel(id: ModelId): THREE.Object3D | null {
  const entry = modelEntries.get(id) ?? modelEntry(id);
  return useLoaded(entry);
}

/**
 * Preload the models and the material palette the renderer actually uses, at the
 * exact tiling each is drawn with (so the cache warms the right entries). Catalog
 * materials that no component references (asphalt/concrete/metal) are intentionally
 * not preloaded.
 */
const PRELOAD_MATERIALS: ReadonlyArray<readonly [MaterialId, number]> = [
  ['pavement', 1], ['facade', 1], ['brick', 1], ['plaster', 1], ['tileFacade', 1],
  ['cobble', 3], ['brickPath', 6],
];

export function preloadWorldAssets() {
  if (!hasDom || !WORLD_ASSETS_ENABLED) return;
  (Object.keys(MODELS) as ModelId[]).forEach((id) => modelEntry(id));
  for (const [id, repeat] of PRELOAD_MATERIALS) {
    const def = MATERIALS[id];
    textureEntry(def.diff, true, repeat, repeat);
    textureEntry(def.nor, false, repeat, repeat);
    textureEntry(def.arm, false, repeat, repeat);
  }
}
