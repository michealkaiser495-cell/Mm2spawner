# Self-hosting Nocta 24/7 (local) + public via Cloudflare CDN

Nocta is a **static site** — the "server" only serves files. Your wallet keys live in
each visitor's browser, never on the server, so there are no server-side secrets to protect.

## 1. Run it 24/7 on your machine

### Option A — Docker (recommended, auto-restarts)

Requires Docker Desktop (Mac/Windows) or Docker Engine (Linux).

```bash
cd wallet
docker compose up -d --build
```

- Opens at **http://localhost:8080**
- `restart: unless-stopped` keeps it running across reboots and crashes.
- Update after code changes: `git pull && docker compose up -d --build`
- Stop: `docker compose down`

### Option B — No Docker (Node + pm2)

Requires Node.js 20+.

```bash
cd wallet
npm install
npm run build
npm i -g pm2
pm2 serve dist 8080 --spa --name nocta
pm2 save
pm2 startup      # follow the printed command so it survives reboots
```

- Opens at **http://localhost:8080**
- Rebuild after changes: `npm run build && pm2 restart nocta`

> On **localhost**, the browser treats the page as a secure context, so the wallet's
> encryption works over plain http. For anyone else to reach it you need HTTPS — that's
> what the Cloudflare Tunnel below provides.

## 2. Put it on the internet behind Cloudflare's CDN

A **Cloudflare Tunnel** exposes your local server to a public HTTPS URL through Cloudflare's
CDN — no port forwarding, no exposing your IP. Install `cloudflared`
(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

### Quick test (random free URL)

```bash
cloudflared tunnel --url http://localhost:8080
```

Prints a `https://<random>.trycloudflare.com` URL that works immediately (good for testing).

### Permanent (your own domain, behind Cloudflare CDN)

1. Add your domain to Cloudflare (free plan is fine).
2. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**.
3. Copy the tunnel **token**, put it in a `.env` file next to `docker-compose.yml`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...your token...
   ```
4. In the tunnel's **Public Hostname** settings, point your hostname (e.g.
   `wallet.yourdomain.com`) at the service **`http://nocta:80`** (or `http://localhost:8080`
   if you run cloudflared outside Docker).
5. `docker compose up -d` — the included `cloudflared` service connects automatically.

Cloudflare serves it over HTTPS and caches the static assets on their CDN worldwide.

## 3. One required step for the Buy button

Add your final public URL (e.g. `https://wallet.yourdomain.com`) and
`http://localhost:8080` as **Allowed Origins** on your Crossmint client key, or Crossmint
checkout will refuse to load.

## Notes

- Your machine must stay powered on and online for 24/7 availability. If that's a concern,
  a free static host (Cloudflare Pages / Vercel / Netlify) is more reliable — see README.
- The strict Content-Security-Policy is baked into the build; nginx adds a few extra headers.
- Nothing here stores private keys on disk or on any server.
