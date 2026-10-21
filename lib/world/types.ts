/** Data contracts shared by the extraction pipeline, the 3D scene and the map. */

export type WorldMeta = {
  kind: 'lagos-world';
  version: number;
  snapshot: string;
  source: string;
  license: string;
  attribution: string;
  bounds: { west: number; south: number; east: number; north: number };
  /** The single continuous street every destination sits on. */
  mainStreet?: { name: string; length: number; stops: number };
  /**
   * The area the car is designed to drive in, inside `worldBounds`. The map
   * camera fits this, the scene keeps its detail here, and the UI describes the
   * world by this size — the previous district-sized bounds were the bug.
   */
  playable?: {
    bounds: { west: number; south: number; east: number; north: number };
    world: { minX: number; maxX: number; minZ: number; maxZ: number };
    size: { width: number; depth: number };
  };
  /** How the shipped road network was curated from the OSM extract. */
  curation?: {
    curated: boolean;
    inputWays: number;
    outputWays: number;
    note: string;
    limitations: string[];
  };
  origin: { lat: number; lng: number };
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  size: { width: number; depth: number };
  scaleAtOrigin: number;
  crs: string;
  units: string;
  chunks: number;
  generatedAt: string;
};

export type RoadData = {
  id: number;
  cls: string;
  name: string | null;
  width: number;
  oneway: -1 | 0 | 1;
  bridge: boolean;
  tunnel: boolean;
  /** World-space polyline [x,z,…] in metres. */
  pts: number[];
};

export type StationData = {
  zone: string;
  label: string;
  x: number;
  z: number;
  heading: number;
  node: number;
  nodeIndex: number;
  toNode: number;
  /** Far endpoint of the station's edge (index into graph nodes). */
  nodeIndexFar?: number;
  /** Index of the graph edge the station sits on. */
  edge?: number;
  /** Street address, e.g. `7 Adeniji Adele Road`. */
  address?: string;
  /** Distance along the main street from its start, metres. */
  streetOffset?: number;
  /** Carriageway width where the stop sits, metres. */
  roadWidth?: number;
  road: string | null;
  roadClass: string;
  snapDistance: number;
  anchor: { lat: number; lng: number };
};

export type PoiData = { k: string; n: string; x: number; z: number };

export type MainStreetData = {
  name: string;
  length: number;
  /** Flat [x,z,…] centreline, travel order. */
  p: number[];
  /** Station zones in street order. */
  stations: string[];
  addresses: string[];
};

export type WorldData = {
  meta: WorldMeta;
  mainStreet?: MainStreetData;
  roads: RoadData[];
  /** Water polygons, flat [x,z,…] rings. */
  water: number[][];
  green: number[][];
  sea: number[][];
  waterwayLines: { w: number; p: number[] }[];
  /** [x, z, scale] triples. */
  trees: number[][];
  /** [x, z, side] triples. */
  lights: number[][];
  /** Pedestrian crossings snapped onto the road network. */
  crossings: { x: number; z: number; h: number; w: number }[];
  signals: number[];
  pois: PoiData[];
  stations: StationData[];
  spawn: { x: number; z: number; yaw: number; nodeIndex: number; node: number; road: string | null } | null;
};

export type Building = { h: number; p: number[] };
export type BuildingChunk = { row: number; col: number; count: number; b: Building[] };

export type GraphPayload = {
  nodes: { id: number; x: number; z: number }[];
  edges: {
    a: number;
    b: number;
    p: number[];
    len: number;
    cls: string;
    name: string | null;
    speed: number;
    way: number;
    oneway: boolean;
  }[];
  banned: number[][];
  stats: { junctionCount: number; edgeCount: number; components: number[]; mainComponent: number; droppedShortEdges: number };
};

export type Provenance = {
  generatedAt: string;
  source: { name: string; url: string; snapshot: string; license: string; attribution: string; sha256: string; bytes: number };
  bounds: { west: number; south: number; east: number; north: number };
  boundsNote?: string;
  crs: { source: string; world: string; scaleAtOrigin: number; distortionNote: string };
  counts: Record<string, unknown>;
  quality: Record<string, unknown>;
  outputs: Record<string, unknown>;
};
