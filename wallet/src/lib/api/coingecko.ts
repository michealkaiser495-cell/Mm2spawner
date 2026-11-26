/** CoinGecko public API — historical price charts and fiat conversion rates. */
import { getJson } from './http';

const BASE = 'https://api.coingecko.com/api/v3';

export type ChartRange = '1D' | '1W' | '1M' | '1Y';
export const RANGE_DAYS: Record<ChartRange, number> = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 };

export type PricePoint = [timestampMs: number, usd: number];

export async function getSolHistory(range: ChartRange): Promise<PricePoint[]> {
  const r = await getJson<{ prices: PricePoint[] }>(
    `${BASE}/coins/solana/market_chart?vs_currency=usd&days=${RANGE_DAYS[range]}`,
  );
  return r.prices;
}

/** Price history for an SPL token by mint (only for tokens CoinGecko lists). */
export async function getTokenHistory(mint: string, range: ChartRange): Promise<PricePoint[]> {
  const r = await getJson<{ prices: PricePoint[] }>(
    `${BASE}/coins/solana/contract/${encodeURIComponent(mint)}/market_chart?vs_currency=usd&days=${RANGE_DAYS[range]}`,
  );
  return r.prices;
}

export const CURRENCIES = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'inr', 'brl'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Returns multipliers converting USD → each supported currency. */
export async function getFiatRates(): Promise<Record<string, number>> {
  const r = await getJson<{ rates: Record<string, { value: number }> }>(`${BASE}/exchange_rates`);
  const usd = r.rates.usd?.value;
  if (!usd) throw new Error('Exchange rates unavailable');
  const out: Record<string, number> = {};
  for (const c of CURRENCIES) {
    const v = r.rates[c]?.value;
    if (v) out[c] = v / usd;
  }
  return out;
}
