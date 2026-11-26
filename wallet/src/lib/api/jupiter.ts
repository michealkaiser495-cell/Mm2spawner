/**
 * Jupiter APIs (https://dev.jup.ag) — Solana mainnet token metadata, prices and swap routing.
 * Only public token mints and the user's PUBLIC key (for building swap transactions) are sent.
 */
import { getJson } from './http';

const BASE = 'https://lite-api.jup.ag';

export interface JupToken {
  id: string; // mint
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  tokenProgram?: string;
  usdPrice?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  holderCount?: number;
  circSupply?: number;
  totalSupply?: number;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
  organicScoreLabel?: string;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  website?: string;
  twitter?: string;
  stats24h?: { priceChange?: number; buyVolume?: number; sellVolume?: number; numTraders?: number };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    isSus?: boolean;
  };
  firstPool?: { createdAt?: string };
}

export const NATIVE_SOL_INFO: JupToken = {
  id: 'So11111111111111111111111111111111111111112',
  name: 'Solana',
  symbol: 'SOL',
  decimals: 9,
  isVerified: true,
};

const isMint =(s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

export async function searchTokens(query: string): Promise<JupToken[]> {
  const q = query.trim();
  if (!q) return [];
  return getJson<JupToken[]>(`${BASE}/tokens/v2/search?query=${encodeURIComponent(q)}`);
}

/** Batch metadata lookup by mint (up to 100 per request). */
export async function getTokensByMint(mints: string[]): Promise<Record<string, JupToken>> {
  const uniq = [...new Set(mints.filter(isMint))];
  const out: Record<string, JupToken> = {};
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const list = await getJson<JupToken[]>(`${BASE}/tokens/v2/search?query=${chunk.join(',')}`);
    for (const t of list) out[t.id] = t;
  }
  return out;
}

export type TokenCategory = 'toporganicscore' | 'toptrending' | 'toptraded';

export async function getTopTokens(category: TokenCategory, limit = 50): Promise<JupToken[]> {
  return getJson<JupToken[]>(`${BASE}/tokens/v2/${category}/24h?limit=${limit}`);
}

export async function getVerifiedTokens(): Promise<JupToken[]> {
  return getJson<JupToken[]>(`${BASE}/tokens/v2/tag?query=verified`);
}

export interface JupPrice {
  usdPrice: number;
  priceChange24h?: number;
  decimals?: number;
}

/** USD prices (max 50 mints per request). */
export async function getPrices(mints: string[]): Promise<Record<string, JupPrice>> {
  const uniq = [...new Set(mints.filter(isMint))];
  const out: Record<string, JupPrice> = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const res = await getJson<Record<string, JupPrice | null>>(`${BASE}/price/v3?ids=${chunk.join(',')}`);
    for (const [k, v] of Object.entries(res)) if (v && Number.isFinite(v.usdPrice)) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- swap

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string; ammKey: string; inputMint: string; outputMint: string }; percent: number }[];
  contextSlot?: number;
  swapUsdValue?: string;
  [k: string]: unknown;
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  signal?: AbortSignal;
}): Promise<QuoteResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: String(params.slippageBps),
    restrictIntermediateTokens: 'true',
    swapMode: 'ExactIn',
  });
  return getJson<QuoteResponse>(`${BASE}/swap/v1/quote?${qs}`, { signal: params.signal });
}

export interface SwapTxResponse {
  swapTransaction: string; // base64 VersionedTransaction (unsigned)
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  simulationError?: unknown;
}

export type SwapFeeLevel = 'eco' | 'normal' | 'turbo';

// maxLamports is the hard ceiling on the priority fee Jupiter attaches, so a low cap keeps swaps
// cheap regardless of priorityLevel. (Jupiter's API accepts medium/high/veryHigh, not "low".)
const SWAP_FEE_TIERS: Record<SwapFeeLevel, { maxLamports: number; priorityLevel: 'medium' | 'high' | 'veryHigh' }> = {
  eco: { maxLamports: 10_000, priorityLevel: 'medium' }, // ≤0.00001 SOL — practically free
  normal: { maxLamports: 1_000_000, priorityLevel: 'medium' }, // ≤0.001 SOL
  turbo: { maxLamports: 5_000_000, priorityLevel: 'high' }, // ≤0.005 SOL
};

export async function buildSwapTransaction(quote: QuoteResponse, userPublicKey: string, feeLevel: SwapFeeLevel = 'eco'): Promise<SwapTxResponse> {
  return getJson<SwapTxResponse>(`${BASE}/swap/v1/swap`, {
    method: 'POST',
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: false,
      // Nocta takes no platform fee — users pay only Solana's network cost.
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: SWAP_FEE_TIERS[feeLevel] },
    }),
  });
}

/** Jupiter aggregator v6 program — swap transactions are expected to invoke it. */
export const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
