# Hosting Nocta + enabling card purchases (Buy)

Nocta is a static site. **Send / receive / swap / all coins work on any static host** with no
setup. **Buy with a card** additionally needs one serverless function (so the Crossmint SECRET
key stays off the browser) — which means deploying on a host that runs functions, not a
drag-and-drop upload.

## Easiest: everything except Buy (drag-and-drop)

Drag the `wallet/prebuilt` folder onto https://app.netlify.com/drop or upload its contents to your
Bunny Storage zone. Buy will show "needs the server function deployed" and point users to receive
from an exchange.

## Full app incl. Buy (Netlify, ~5 min)

1. Go to https://app.netlify.com → **Add new site → Import an existing project → GitHub** →
   pick `Mm2spawner` and set **Branch to deploy** = `claude/crypto-wallet-app-s3fjpf`. Leave every
   build field as it is: the repository-root `netlify.toml` publishes `wallet/prebuilt` as-is and
   deploys the order function from `wallet/netlify/functions`. It checks that the prebuilt entry
   point exists but does not compile the wallet source.
2. In **Site settings → Environment variables**, add:
   - `CROSSMINT_SERVER_KEY` = your Crossmint **server** key (`sk_staging_…` for test,
     `sk_production_…` for live). This lives only on Netlify's servers — never in the app, never
     in the repo.
3. Deploy. Your site gets a URL like `your-site.netlify.app`.
4. In your **Crossmint dashboard**, add that URL (and `http://localhost:4173` for local testing)
   to the **allowed origins** of your **client** key (`ck_`). The client key is already built
   into the app.

To publish newer wallet source, produce a new static export and replace the contents of
`wallet/prebuilt`. Changes in `wallet/src` do not automatically reach the deployed frontend.

### How Buy works

`netlify/functions/crossmint-order.mjs` (server-side): links the buyer's Solana address to a
Crossmint user by email, then creates the order, and returns an `orderId` + `clientSecret`. The
app renders Crossmint's embedded checkout with those — card / Apple Pay / Google Pay — and
Crossmint delivers USDC to the buyer's own Solana address.

- **Test mode** (staging keys): card `4242 4242 4242 4242`, any future expiry, any CVC. No real
  money, settles on devnet.
- **Live** (production keys): set a `ck_production_` key in the app and `sk_production_` in the
  Netlify env var. Production Crossmint access requires their business verification.

## Vercel / Cloudflare

Both also run functions. Put the same handler in their functions format (`api/` for Vercel,
Pages Functions for Cloudflare) and set the `CROSSMINT_SERVER_KEY` env var the same way.
