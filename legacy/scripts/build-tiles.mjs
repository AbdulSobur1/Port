/**
 * Build the regional vector-tile archive for the verified Lagos bounds.
 *
 * Input : data/raw/nigeria-261015.osm.pbf  (Geofabrik, md5-verified)
 * Output: public/map/lagos.pmtiles          (PMTiles v3, OpenMapTiles schema)
 *
 * Uses Planetiler (pinned jar in tools/) with --bounds clipping; the
 * national extract is never shipped — only the clipped archive leaves
 * data/. Temp data goes to data/tmp (gitignored).
 *
 * Usage:  node scripts/build-tiles.mjs
 * Needs:  Java 21+, node scripts/download-sources.mjs, node scripts/download-osm.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, BOUNDS, OSM_SOURCE, PLANETILER, OUTPUT } from './geo-config.mjs';

const pbfPath = path.join(ROOT, OSM_SOURCE.file);
const jarPath = path.join(ROOT, PLANETILER.file);
const outPath = path.join(ROOT, OUTPUT.pmtiles);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// --- preflight ------------------------------------------------------------
if (!fs.existsSync(pbfPath)) fail(`missing ${OSM_SOURCE.file} — run: node scripts/download-osm.mjs`);
if (!fs.existsSync(jarPath)) fail(`missing ${PLANETILER.file} — run: node scripts/download-sources.mjs`);

const actualBytes = fs.statSync(pbfPath).size;
if (actualBytes !== OSM_SOURCE.expectedBytes) {
  fail(`PBF size ${actualBytes} != expected ${OSM_SOURCE.expectedBytes} — re-run download-osm.mjs`);
}

const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
if (java.status !== 0) fail('Java 21+ is required to run Planetiler (https://adoptium.net/)');

for (const f of ['water-polygons-split-3857.zip', 'lake_centerline.shp.zip']) {
  if (!fs.existsSync(path.join(ROOT, 'data/sources', f))) {
    fail(`missing data/sources/${f} — run: node scripts/download-sources.mjs`);
  }
}

// Natural Earth is only used for continent/country labels at zoom ≤ 6, which
// this portfolio map never reaches (the world data itself is the 3D scene).
// The 434 MB archive is optional: if it is absent the build runs without it,
// and `--natural_earth_path=` keeps Planetiler from downloading it mid-build.
const nePath = path.join(ROOT, 'data/sources/natural_earth_vector.sqlite.zip');
const hasNaturalEarth = fs.existsSync(nePath) && fs.statSync(nePath).size > 100 * 1024 * 1024;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data', 'tmp'), { recursive: true });

// --- planetiler -----------------------------------------------------------
const bounds = [BOUNDS.west, BOUNDS.south, BOUNDS.east, BOUNDS.north].join(',');
const args = [
  `-Xmx${PLANETILER.javaXmx}`,
  '-jar', jarPath,
  `--osm_path=${pbfPath}`,
  `--output=${outPath}`,
  `--bounds=${bounds}`,
  `--maxzoom=${PLANETILER.maxzoom}`,
  '--force',
  '--tmpdir=data/tmp',
  // Background layers for low zooms come from these pinned local archives,
  // pre-fetched by `node scripts/download-sources.mjs`. Pointing at them
  // explicitly keeps the build hermetic (Planetiler's own downloader is
  // flaky behind proxies) and makes offline rebuilds possible.
  `--water_polygons_path=${path.join(ROOT, 'data/sources/water-polygons-split-3857.zip')}`,
  `--lake_centerlines_path=${path.join(ROOT, 'data/sources/lake_centerline.shp.zip')}`,
  hasNaturalEarth ? `--natural_earth_path=${nePath}` : '--natural_earth_path=',
];

console.log(`planetiler ${PLANETILER.version} → ${OUTPUT.pmtiles}`);
console.log(`  bounds: ${bounds}  maxzoom: ${PLANETILER.maxzoom}`);
const t0 = Date.now();
const run = spawnSync('java', args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
if (run.status !== 0) fail(`planetiler exited with code ${run.status}`);

// --- report ---------------------------------------------------------------
const bytes = fs.statSync(outPath).size;
const sha256 = createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
console.log(`\nOK ${OUTPUT.pmtiles}`);
console.log(`  size: ${(bytes / 1048576).toFixed(1)} MiB`);
console.log(`  sha256: ${sha256}`);
console.log(`  took: ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`  attribution: ${OSM_SOURCE.attribution} (ODbL)`);
