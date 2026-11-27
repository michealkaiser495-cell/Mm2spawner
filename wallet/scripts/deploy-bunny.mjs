/**
 * Upload the built `dist/` folder to a Bunny.net Storage Zone (which your Pull Zone serves
 * over the b-cdn.net CDN). No secrets are stored in the repo — pass them as env vars:
 *
 *   BUNNY_STORAGE_ZONE   your storage zone name            (required)
 *   BUNNY_STORAGE_KEY    the storage zone password/API key (required)   [from Bunny dashboard]
 *   BUNNY_STORAGE_HOST   storage endpoint host             (default storage.bunnycdn.com)
 *                        region hosts: ny. la. sg. syd. uk. se. br. jh. storage.bunnycdn.com
 *   BUNNY_PULLZONE_ID    pull zone id to purge after upload (optional)
 *   BUNNY_ACCOUNT_KEY    account API key, needed only for the purge     (optional)
 *
 * Usage:
 *   npm run build
 *   BUNNY_STORAGE_ZONE=nocta BUNNY_STORAGE_KEY=xxxx node scripts/deploy-bunny.mjs
 *   # add --dry-run to just list what would upload
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry-run');
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const KEY = process.env.BUNNY_STORAGE_KEY;
const HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', json: 'application/json', woff2: 'font/woff2', png: 'image/png', webp: 'image/webp',
  ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', map: 'application/json',
};
const ctype = (f) => TYPES[f.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  try {
    await stat(DIST);
  } catch {
    console.error('✗ dist/ not found — run `npm run build` first.');
    process.exit(1);
  }
  const files = await walk(DIST);
  const rels = files.map((f) => relative(DIST, f).split(sep).join('/'));
  console.log(`${files.length} files in dist/`);

  if (DRY) {
    rels.forEach((r) => console.log('  would upload /' + r));
    console.log('\nDry run — nothing uploaded.');
    return;
  }
  if (!ZONE || !KEY) {
    console.error('✗ Set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_KEY (or use --dry-run).');
    process.exit(1);
  }

  let done = 0;
  for (let i = 0; i < files.length; i++) {
    const body = await readFile(files[i]);
    const url = `https://${HOST}/${ZONE}/${rels[i]}`;
    const res = await fetch(url, { method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': ctype(rels[i]) }, body });
    if (!res.ok) {
      console.error(`✗ ${rels[i]} → ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    done++;
    process.stdout.write(`\r  uploaded ${done}/${files.length}`);
  }
  console.log(`\n✓ Uploaded ${done} files to Bunny Storage zone "${ZONE}".`);

  if (process.env.BUNNY_PULLZONE_ID && process.env.BUNNY_ACCOUNT_KEY) {
    const r = await fetch(`https://api.bunny.net/pullzone/${process.env.BUNNY_PULLZONE_ID}/purgeCache`, {
      method: 'POST', headers: { AccessKey: process.env.BUNNY_ACCOUNT_KEY },
    });
    console.log(r.ok ? '✓ Purged pull-zone cache.' : `⚠ Cache purge failed (${r.status}) — purge manually in the dashboard.`);
  } else {
    console.log('ℹ Tip: click "Purge Cache" in your Bunny Pull Zone so the new build goes live immediately.');
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
