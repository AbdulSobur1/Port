/**
 * Copy MapLibre's worker bundle into `public/`.
 *
 * MapLibre GL JS derives its worker URL from `import.meta.url` and expects
 * `./maplibre-gl-worker.mjs` to sit next to the module it was loaded from.
 * After a bundler rewrite that URL points inside `/_next/static/chunks/`, where
 * no such file exists: Next answers with an HTML 404, the module worker is
 * rejected on MIME grounds, and the map hangs on "Loading street data…".
 *
 * The published worker bundle is self-contained (no imports), so serving it
 * from our own origin and pointing MapLibre at it with `setWorkerUrl()` is both
 * the supported fix and keeps everything first-party.
 *
 * Run by `npm run map:worker` and automatically before `dev`/`build`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const target = resolve(root, 'public/map/maplibre-gl-worker.mjs');

if (!existsSync(source)) {
  console.error(`MapLibre worker not found at ${source}. Run the package manager install first.`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });

const current = existsSync(target) ? statSync(target) : null;
const incoming = statSync(source);
if (current && current.size === incoming.size && current.mtimeMs >= incoming.mtimeMs) {
  console.log(`map worker already current (${incoming.size} bytes)`);
  process.exit(0);
}

copyFileSync(source, target);
console.log(`copied maplibre-gl-worker.mjs → public/map (${incoming.size} bytes)`);
