/**
 * Fetch the pinned Planetiler jar and the background source archives it needs
 * for low-zoom water / landcover (so the tile build never reaches the network).
 *
 *   node scripts/download-sources.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, PLANETILER } from './geo-config.mjs';

const SOURCES = [
  {
    url: 'https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip',
    file: 'data/sources/water-polygons-split-3857.zip',
    note: 'OSMData water polygons (public domain) — ocean/lake fills at low zoom',
  },
  {
    url: 'https://osmdata.openstreetmap.de/download/lake_centerline.shp.zip',
    file: 'data/sources/lake_centerline.shp.zip',
    note: 'OSMData lake centerlines (public domain) — lake labels',
  },
  {
    url: 'https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip',
    file: 'data/sources/natural_earth_vector.sqlite.zip',
    note: 'Natural Earth (public domain) — country/state labels and boundaries',
  },
];

async function fetchTo(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const expected = Number(res.headers.get('content-length') || 0);
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  let written = 0;
  let last = Date.now();
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    written += chunk.length;
    if (Date.now() - last > 5000) {
      last = Date.now();
      console.log(`  ${(written / 1048576).toFixed(1)} MiB${expected ? ` / ${(expected / 1048576).toFixed(1)}` : ''}`);
    }
  }
  await new Promise((r) => out.end(r));
  fs.renameSync(tmp, dest);
  if (expected && written !== expected) throw new Error(`truncated download: ${written}/${expected}`);
  return written;
}

const jar = path.join(ROOT, PLANETILER.file);
fs.mkdirSync(path.dirname(jar), { recursive: true });
if (!fs.existsSync(jar)) {
  console.log(`planetiler jar -> ${PLANETILER.file}`);
  const bytes = await fetchTo(PLANETILER.url, jar);
  console.log(`  ${(bytes / 1048576).toFixed(1)} MiB`);
}
const expectedSha = (await (await fetch(PLANETILER.sha256Url, { redirect: 'follow' })).text())
  .trim()
  .split(/\s+/)[0]
  .toLowerCase();
const actualSha = createHash('sha256').update(fs.readFileSync(jar)).digest('hex');
if (expectedSha && expectedSha !== actualSha) {
  throw new Error(`planetiler jar sha256 mismatch: ${actualSha} != ${expectedSha}`);
}
console.log(`OK planetiler ${PLANETILER.version} sha256 ${actualSha.slice(0, 16)}…`);

for (const s of SOURCES) {
  const dest = path.join(ROOT, s.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    console.log(`OK ${s.file} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MiB) — ${s.note}`);
    continue;
  }
  console.log(`fetching ${s.file} — ${s.note}`);
  const bytes = await fetchTo(s.url, dest);
  console.log(`OK ${s.file} (${(bytes / 1048576).toFixed(1)} MiB)`);
}
