/**
 * Serverless order creator for Crossmint on-ramp. Runs on Netlify (server-side), so the SECRET
 * key never reaches the browser. It links the buyer's external Solana wallet to a Crossmint user
 * (by email) and creates the order; the client then renders the embedded checkout with the
 * returned orderId + clientSecret.
 *
 * Required env var (set in Netlify → Site settings → Environment variables):
 *   CROSSMINT_SERVER_KEY = sk_staging_... (test) or sk_production_... (live)
 */
const USDC = {
  staging: 'solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  production: 'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

function json(body, statusCode = 200) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sk = process.env.CROSSMINT_SERVER_KEY;
  if (!sk || !sk.startsWith('sk_')) return json({ error: 'Card buying is not configured yet (missing CROSSMINT_SERVER_KEY).' }, 503);

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const amount = String(input.amount ?? '').trim();
  const email = String(input.email ?? '').trim();
  const walletAddress = String(input.walletAddress ?? '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email is required.' }, 400);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) return json({ error: 'Invalid Solana wallet address.' }, 400);
  if (!(Number(amount) >= 1 && Number(amount) <= 1000)) return json({ error: 'Amount must be between $1 and $1000.' }, 400);

  const prod = sk.startsWith('sk_production_');
  const host = prod ? 'https://www.crossmint.com' : 'https://staging.crossmint.com';
  const headers = { 'x-api-key': sk, 'content-type': 'application/json' };

  try {
    // 1) Link the buyer's external wallet to their Crossmint user (idempotent).
    await fetch(`${host}/api/2025-06-09/users/email:${encodeURIComponent(email)}/linked-wallets/${encodeURIComponent(walletAddress)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ chain: 'solana' }),
    });

    // 2) Create the order delivering USDC to that wallet.
    const res = await fetch(`${host}/api/2022-06-09/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        lineItems: [{ tokenLocator: prod ? USDC.production : USDC.staging, executionParameters: { mode: 'exact-in', amount } }],
        payment: { method: 'card', receiptEmail: email },
        recipient: { walletAddress },
      }),
    });
    const data = await res.json();
    if (data.error) {
      const msg = String(data.message || '');
      // The key is valid but lacks the on-ramp scope — a dashboard setting, not a code bug.
      if (res.status === 403 || /scopes|orders\.create/i.test(msg)) {
        return json({ error: 'This Crossmint key cannot create card purchases yet. In your Crossmint dashboard, enable the on-ramp / "orders.create" scope for this key (production on-ramp needs Crossmint business verification).', code: 'missing_scope' }, 403);
      }
      if (/unsupported token/i.test(msg)) return json({ error: 'Crossmint does not sell that token. USDC is supported.', code: 'unsupported_token' }, 400);
      return json({ error: msg || 'Crossmint rejected the order.' }, 400);
    }

    const order = data.order || data;
    const clientSecret = data.clientSecret || order.clientSecret;
    if (!order.orderId || !clientSecret) return json({ error: 'Unexpected Crossmint response.' }, 502);
    return json({ orderId: order.orderId, clientSecret, env: prod ? 'production' : 'staging' });
  } catch (e) {
    return json({ error: 'Could not reach Crossmint. Try again.' }, 502);
  }
};
