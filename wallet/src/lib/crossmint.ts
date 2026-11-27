/**
 * Crossmint Buy (fiat on-ramp) configuration.
 *
 * Crossmint's Onramp sells USDC delivered to an external wallet address, paid by card / Apple Pay
 * / Google Pay on Crossmint's own hosted checkout. We use a CLIENT key (ck_…) only — never a
 * secret key. The key is supplied by the user and stored on-device; it is origin-restricted by
 * Crossmint. The hosted checkout opens Crossmint's real payment page (where Apple Pay appears);
 * Nocta never touches card details.
 */

export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Crossmint staging settles on Solana devnet with a test USDC mint.
export const USDC_MINT_STAGING = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/**
 * Built-in Crossmint CLIENT key. Safe to ship in the browser — it is origin-restricted (only
 * works from the app's whitelisted domains) and limited to the `orders.create` scope, exactly
 * like a Stripe publishable key. NEVER put a secret (sk_) key here. Users can override this in
 * Settings → Buy. This is a STAGING (test) key, so purchases run in test mode on devnet; swap it
 * for a ck_production_ key (set in Settings, or here) to take real payments.
 *
 * Requires the app's origin (e.g. https://cryptowalletno.lovable.app and http://localhost:4173)
 * to be whitelisted on the key in the Crossmint dashboard.
 */
export const DEFAULT_CROSSMINT_CLIENT_KEY =
  'ck_staging_2zcJYTJg7sGmpJJy76fPeVdgv6JA885HYJeunVunkqwtQj13b5M5oe2BwQRyhqkmjqd8JneGaDMhEgDEgx86zGEidJBphpKhyrvGmhDotiD2R9CMEcK8Kw3B9Rgp3V9vQTDQv8WcLmsGUrD947gJr3TKgNA91RPHVstD3Eh2TyKjkHgGfwz6wyHaTGacXdwMRyiE6KGGvoNRuUDbTDoPRjF';

export type CrossmintEnv = 'staging' | 'production';

export function crossmintEnv(clientKey: string): CrossmintEnv {
  return clientKey.startsWith('ck_production_') ? 'production' : 'staging';
}

export function isValidClientKey(key: string): boolean {
  return /^ck_(production|staging)_[A-Za-z0-9]+$/.test(key.trim());
}

/** The `solana:<mint>` token locator Crossmint uses, matched to the key's environment. */
export function usdcTokenLocator(clientKey: string): string {
  return `solana:${crossmintEnv(clientKey) === 'production' ? USDC_MINT_MAINNET : USDC_MINT_STAGING}`;
}

export const CROSSMINT_MIN_USD = 1;
export const CROSSMINT_MAX_USD = 1000; // light-KYC / no wallet-ownership-check ceiling

/** Crossmint delivers on mainnet for production keys and devnet for staging keys. */
export function crossmintDeliversTo(clientKey: string): 'mainnet-beta' | 'devnet' {
  return crossmintEnv(clientKey) === 'production' ? 'mainnet-beta' : 'devnet';
}
