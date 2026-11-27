# Hosting Nocta on Bunny.net CDN

Nocta is a static site, so Bunny serves it directly from storage — no server to run.

## One-time setup (Bunny dashboard)

1. **Storage → Add Storage Zone** → name it (e.g. `nocta`), pick a main region.
   Copy its **Password** (Storage → your zone → FTP & API Access → *Password*). That's your
   `BUNNY_STORAGE_KEY`. Note the storage **hostname** for your region
   (e.g. `storage.bunnycdn.com`, `ny.storage.bunnycdn.com`, …).
2. **CDN → Add Pull Zone** → **Origin Type: Storage Zone** → select the zone above.
   This gives you a public URL like `https://nocta.b-cdn.net` (HTTPS automatic).
3. (Optional) Add a **custom domain** on the Pull Zone; Bunny issues a free SSL cert.

No rewrite/SPA rules are needed — Nocta uses hash routing (`/#/...`), so the CDN only ever
serves `index.html` and `/assets/*`.

## Deploy (every time you want to publish)

```bash
cd wallet
npm install          # first time only
npm run build
BUNNY_STORAGE_ZONE=nocta \
BUNNY_STORAGE_KEY=your-storage-password \
BUNNY_STORAGE_HOST=storage.bunnycdn.com \
npm run deploy:bunny
```

Then click **Purge Cache** on the Pull Zone (or set `BUNNY_PULLZONE_ID` + `BUNNY_ACCOUNT_KEY`
env vars and the script purges automatically).

Preview what would upload without sending anything: `node scripts/deploy-bunny.mjs --dry-run`.

## Required: Crossmint origin

Add your final Bunny URL (e.g. `https://nocta.b-cdn.net` or your custom domain) as an
**Allowed Origin** on your Crossmint client key, or the Buy button won't load.

## Notes

- Keep `BUNNY_STORAGE_KEY` out of the repo — pass it as an env var (as above) or put it in a
  local, git-ignored `.env` you `source` before deploying.
- HTTPS is required for the wallet's encryption and Crossmint; Bunny's `b-cdn.net` and custom
  domains are HTTPS by default.
