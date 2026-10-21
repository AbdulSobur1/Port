/**
 * Derive the 3D water polygons from the local vector-tile archive.
 *
 * Why not the PBF directly? The Lagos Lagoon and the Atlantic are mapped as
 * multipolygons/coastlines that extend far beyond the extraction rectangle, so
 * a bounds-limited PBF pass cannot stitch their rings. Planetiler reads the
 * whole national extract and clips correctly, so its `water` layer is the
 * accurate, already-clipped source — and using it guarantees the 3D water is
 * the same shape the map draws.
 *
 *   node scripts/extract-water-from-tiles.mjs
 *
 * Output: public/data/lagos-water.json  (world metres, [x,z,…] rings)
 */

import fs from 'node:fs';
import path from 'node:path';
import { PMTiles, FileSource } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { ROOT, BOUNDS, OUTPUT } from './geo-config.mjs';
import { createProjection } from '../lib/geo/projection.ts';
import { rdpFlat, ringArea } from './lib/geometry-utils.mjs';

const Z = 14;
const proj = createProjection(BOUNDS);
const archivePath = path.join(ROOT, OUTPUT.pmtiles);
const outPath = path.join(ROOT, 'public/data/lagos-water.json');

if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size < 1024) {
  console.error(`Missing ${OUTPUT.pmtiles} — run: node scripts/build-tiles.mjs`);
  process.exit(1);
}

const mercX = (lng) => proj.toWorld(lng, 0).x;
const mercZ = (lat) => proj.toWorld(0, lat).z;

const R = 6378137;
const DEG = Math.PI / 180;
const TILE = 2 * Math.PI * R;

function tileRange(bounds, z) {
  const n = 2 ** z;
  const tx = (lng) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat) => {
    const rad = lat * DEG;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  };
  return {
    minX: tx(bounds.west), maxX: tx(bounds.east),
    minY: ty(bounds.north), maxY: ty(bounds.south),
  };
}

// PMTiles' FileSource expects a Blob (browser File API); Node's Blob implements
// the same slice().arrayBuffer() contract, so the archive can be read locally.
const blob = new Blob([fs.readFileSync(archivePath)]);
const archive = new PMTiles(new FileSource(blob));
const header = await archive.getHeader();
const MAXZ = Math.min(Z, header.maxZoom);
const range = tileRange(BOUNDS, MAXZ);

console.log(`archive maxzoom ${header.maxZoom}; sampling z${MAXZ} tiles ${range.minX}..${range.maxX} / ${range.minY}..${range.maxY}`);

const polygons = [];
const classes = {};
let tilesRead = 0, features = 0, dropped = 0;

for (let x = range.minX; x <= range.maxX; x++) {
  for (let y = range.minY; y <= range.maxY; y++) {
    const tile = await archive.getZxy(MAXZ, x, y);
    if (!tile) continue;
    tilesRead++;
    const vt = new VectorTile(new PbfReader(new Uint8Array(tile.data)));
    const layer = vt.layers.water;
    if (!layer) continue;
    const extent = layer.extent || 4096;
    const worldOffsetX = (x / 2 ** MAXZ) * TILE - Math.PI * R;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (feature.type !== 3) continue;
      const rings = feature.loadGeometry();
      if (!rings.length) continue;
      const ring = rings[0];
      if (ring.length < 3) continue;
      const world = [];
      for (const pt of ring) {
        const gx = worldOffsetX + (pt.x / extent) * (TILE / 2 ** MAXZ);
        const gy = Math.PI * R - (y + pt.y / extent) * (TILE / 2 ** MAXZ);
        world.push(gx - mercX(proj.origin.lng), gy - mercZ(proj.origin.lat));
      }
      let p = rdpFlat(world, 1.2);
      if (p.length < 6) { dropped++; continue; }
      if (Math.abs(ringArea(p)) < 400) { dropped++; continue; }
      p = p.map((v) => Math.round(v * 10) / 10);
      polygons.push(p);
      features++;
      const cls = feature.properties.class || feature.properties.subclass || 'water';
      classes[cls] = (classes[cls] ?? 0) + 1;
    }
  }
}

const payload = {
  meta: {
    derivedFrom: OUTPUT.pmtiles,
    zoom: MAXZ,
    kind: 'lagos-water',
    bounds: BOUNDS,
    origin: proj.origin,
    crs: 'world metres (Web Mercator, local origin at bounds centre)',
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    note:
      'Clipped water polygons sampled from the same vector-tile build the map renders, ' +
      'because lagoon/coast multipolygons extend beyond the extraction rectangle.',
  },
  classes,
  polygons,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(`tiles read ${tilesRead}, water polygons ${polygons.length}, dropped ${dropped}, classes ${JSON.stringify(classes)}`);
console.log(`wrote public/data/lagos-water.json (${(JSON.stringify(payload).length / 1048576).toFixed(2)} MiB)`);
