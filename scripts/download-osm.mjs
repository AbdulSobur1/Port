/**
 * Download (and verify) the pinned Geofabrik Nigeria OSM extract.
 *
 *   node scripts/download-osm.mjs          # resume + verify
 *   node scripts/download-osm.mjs --force  # re-download from scratch
 *
 * The national extract (~711 MB) is intentionally NOT shipped: it is only a
 * processing input. The website serves the clipped Lagos archive produced by
 * scripts/build-tiles.mjs and the world data from scripts/extract-world-data.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, OSM_SOURCE } from './geo-config.mjs';

const target = path.join(ROOT, OSM_SOURCE.file);
const force = process.argv.includes('--force');

if (force && fs.existsSync(target)) fs.rmSync(target);
fs.mkdirSync(path.dirname(target), { recursive: true });

async function download(url, dest, expectedBytes) {
  const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (expectedBytes && have === expectedBytes) {
    console.log(`  ${path.relative(ROOT, dest)} already complete (${have} bytes)`);
    return;
  }
  if (expectedBytes && have > expectedBytes) {
    console.log('  local file is larger than expected — restarting');
    fs.rmSync(dest);
  }
  const headers = {};
  const start = expectedBytes ? fs.statSync(dest).size : 0;
  if (start > 0) headers.Range = `bytes=${start}-`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok && res.status !== 206) throw new Error(`${url} -> HTTP ${res.status}`);

  const out = fs.createWriteStream(dest, { flags: start > 0 ? 'a' : 'w' });
  const total = expectedBytes ?? Number(res.headers.get('content-length') || 0);
  let written = start;
  let lastLog = Date.now();
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    written += chunk.length;
    if (Date.now() - lastLog > 4000) {
      lastLog = Date.now();
      const pct = total ? ` ${((written / total) * 100).toFixed(1)}%` : '';
      console.log(`  ${(written / 1048576).toFixed(1)} MiB${pct}`);
    }
  }
  await new Promise((r) => out.end(r));
  const size = fs.statSync(dest).size;
  if (expectedBytes && size !== expectedBytes) {
    throw new Error(`size mismatch: got ${size}, expected ${expectedBytes}`);
  }
}

function md5(file) {
  const hash = createHash('md5');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return hash.digest('hex');
}

console.log(`OSM source: ${OSM_SOURCE.url}`);
console.log(`snapshot:   ${OSM_SOURCE.snapshot}`);
console.log(`license:    ${OSM_SOURCE.license}`);

await download(OSM_SOURCE.url, target, OSM_SOURCE.expectedBytes);
await download(OSM_SOURCE.md5Url, path.join(ROOT, 'data/raw/nigeria.osm.pbf.md5'), null);

const md5Field = fs
  .readFileSync(path.join(ROOT, 'data/raw/nigeria.osm.pbf.md5'), 'utf8')
  .trim()
  .split(/\s+/)[0]
  .toLowerCase();
const actual = md5(target);
if (actual !== md5Field) {
  throw new Error(`md5 mismatch: file ${actual} != upstream ${md5Field}`);
}
console.log(`OK md5 ${actual} (matches Geofabrik)`);
