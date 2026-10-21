/**
 * Single source of truth for the geographic pipeline.
 *
 * Every script under scripts/ imports this file so bounds, pinned tool
 * versions, source URLs and output paths can never drift apart.
 *
 * All raw downloads land in data/ (gitignored) and are reproducible via:
 *   node scripts/download-osm.mjs
 *   node scripts/download-sources.mjs
 * Processed outputs land in public/map + public/data (shipped).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extraction bounds — the playable neighbourhood.
 *
 * The history matters, because the first attempt got this wrong. The brief's
 * original rectangle (3.365, 6.420, 3.455, 6.495) covers all of Victoria
 * Island and Ikoyi: 10.0 × 9.9 km, ~99 km², 5 935 road ways, 44 653 buildings.
 * Shipping that as *the playable world* produced exactly the defects it was
 * asked to fix — an oversized map, roads scattered thinly over 10 km with
 * fragments running off-scene, and a car that read as generic because almost
 * nothing was ever close enough to see.
 *
 * The playable world is now a compact, coherent district: the north-west Lagos
 * Island grid around Adeniji Adele Road / Oshodi / Tokunbo / Glover / Thomas
 * streets — 906 × 907 m (0.82 km²) with a 561 × 565 m playable core. That is
 * ~122× less area than the district rectangle, with 900 buildings and 54 named
 * road ways in the extract.
 *
 * The centre is the midpoint of Glover Street. It was chosen by measuring
 * candidate areas inside the original rectangle for building density,
 * named-street count, drivable road metres and service-road share; this one had
 * the densest built fabric, the most named streets and the fewest dead-end
 * service stubs. It is a *provisional extraction rectangle*, not an official
 * neighbourhood boundary. See docs/geo-pipeline.md.
 *
 * `BOUNDS` is the shipped world. `PLAYABLE` is the area the car is designed to
 * drive in; the difference is margin, so no curated road visibly stops at the
 * edge of the playable area.
 */
export const BOUNDS = {
  west: 3.39366,
  south: 6.45166,
  east: 3.4018,
  north: 6.45976,
};

/** The 560 m area the car is designed to drive in (centred in BOUNDS). */
export const PLAYABLE = (() => {
  const half = 0.00252; // ≈ 280 m of latitude/longitude at this latitude
  const lat = (BOUNDS.south + BOUNDS.north) / 2;
  const lng = (BOUNDS.west + BOUNDS.east) / 2;
  return { west: lng - half, south: lat - half, east: lng + half, north: lat + half };
})();

/**
 * Road curation.
 *
 * An extract is not a road network: it is full of service stubs, parking
 * aisles, footways and fragments that dead-end a few metres off a street.
 * `minStubLength` is how far a dangling chain has to run before it counts as a
 * road the player could actually use; anything shorter is pruned iteratively
 * until the network stops producing new stubs, and anything not joined to the
 * largest component afterwards is dropped as an isolated fragment.
 */
export const CURATION = {
  /** Dangling chains shorter than this (metres) are removed. */
  minStubLength: 45,
  /** Ways shorter than this touching the network at only one end are removed. */
  minFragmentLength: 12,
  /** Ways within this distance of a station anchor are never pruned. */
  stationProtection: 30,
  /** Target minimum carriageway width in metres (car + camera comfort). */
  minRoadWidth: 6,
  /** Non-car classes dropped from the drivable world entirely. */
  dropClasses: ['footway', 'path', 'steps', 'cycleway', 'track', 'construction'],
};

/** Pinned OpenStreetMap source (Geofabrik regional extract). */
export const OSM_SOURCE = {
  regionPage: 'https://download.geofabrik.de/africa/nigeria.html',
  url: 'https://download.geofabrik.de/africa/nigeria-261015.osm.pbf',
  md5Url: 'https://download.geofabrik.de/africa/nigeria-261015.osm.pbf.md5',
  file: 'data/raw/nigeria-261015.osm.pbf',
  /** OSM data up to this instant (from the Geofabrik download page). */
  snapshot: '2026-10-15T20:21:00Z',
  expectedBytes: 710882130,
  license: 'ODbL-1.0 (OpenStreetMap Foundation)',
  attribution: '© OpenStreetMap contributors',
};

/** Pinned tile builder. Requires a local Java 21+ runtime. */
export const PLANETILER = {
  version: 'v0.10.2',
  url: 'https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar',
  sha256Url: 'https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar.sha256',
  file: 'tools/planetiler.jar',
  /** Max zoom of the PMTiles archive (OpenMapTiles schema). */
  maxzoom: 15,
  /** Heap for the JVM. The national PBF is ~711 MB; clip is done via --bounds. */
  javaXmx: '6g',
};

export const OUTPUT = {
  /** Neighbourhood vector-tile archive served statically (byte-range requests). */
  pmtiles: 'public/map/lagos.pmtiles',
  /** Offline MapLibre glyph PBFs (fonts). */
  fontsDir: 'public/map/fonts',
  /** World geometry + metadata consumed by the 3D world and route graph. */
  worldData: 'public/data/lagos-world.json',
  /** Pipeline provenance record written next to the world data. */
  provenance: 'public/data/lagos-provenance.json',
};

/**
 * The one main street.
 *
 * Every portfolio stop is placed along this named, continuous carriageway —
 * the brief's first requirement. Adeniji Adele Road is the longest named road
 * in the playable core (the extract contains ~1.9 km of it, a dual carriageway
 * of two one-way chains). `lib/world/main-street.ts` finds the longest chain
 * inside PLAYABLE, and the extractor spreads the stations along it in the
 * order below. Anchors in `STATIONS` are no longer used for placement; they
 * remain as the human-readable intent and are regenerated from the street on
 * every build so the artifact and the documentation cannot drift.
 */
export const MAIN_STREET = {
  name: 'Adeniji Adele Road',
  /** Fraction of the street left clear at each end. */
  margin: 0.06,
};

/**
 * Portfolio destinations.
 *
 * Order is the order they appear on the main street: arrival first, then the
 * five project case records, then the three site pages. `label` and `zone` are
 * the contract; positions, headings and addresses are generated.
 */
export const STATIONS = [
  { zone: 'home', label: 'Arrival' },
  { zone: 'project:proofmesh', label: 'ProofMesh' },
  { zone: 'project:africonnect', label: 'AfriConnect' },
  { zone: 'project:bytebank', label: 'byteBANK' },
  { zone: 'project:ummahconnect', label: 'UmmahConnect' },
  { zone: 'project:medcore', label: 'MedCore' },
  { zone: 'about', label: 'Archive' },
  { zone: 'skills', label: 'Systems' },
  { zone: 'contact', label: 'Signal Room' },
];

export const OSMLicense = {
  odbl: 'https://www.openstreetmap.org/copyright',
  odblText:
    '© OpenStreetMap contributors. Data is available under the Open Database License (ODbL) v1.0.',
};
