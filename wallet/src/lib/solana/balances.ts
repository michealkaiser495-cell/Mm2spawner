import { type Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const NATIVE_MINT = 'So11111111111111111111111111111111111111112';

export interface TokenAccountInfo {
  address: string;
  amount: bigint;
}

export interface TokenHolding {
  mint: string;
  programId: string;
  decimals: number;
  amount: bigint; // summed across token accounts
  accounts: TokenAccountInfo[];
}

export interface OnchainPortfolio {
  owner: string;
  lamports: bigint;
  tokens: TokenHolding[];
  slot: number;
  /** true when the token list could not be loaded (RPC error) — SOL balance is still accurate. */
  tokensPartial: boolean;
}

interface ParsedTokenAccountData {
  parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry on RPC rate limiting (public endpoints throttle aggressively). */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= tries - 1 || !/429|too many|rate|503|502|timeout/i.test(msg)) throw e;
      await sleep(500 * 2 ** i);
    }
  }
}

/**
 * Fetch SOL + SPL balances. The native SOL balance is fetched first and independently, so a
 * rate-limited token-account call never hides your SOL (it just marks the token list partial).
 * Uses 'confirmed' commitment, so funds appear after a single confirmation.
 */
export async function fetchPortfolio(conn: Connection, owner: string): Promise<OnchainPortfolio> {
  const pk = new PublicKey(owner);
  const bal = await withRetry(() => conn.getBalanceAndContext(pk, 'confirmed'));

  let tokensPartial = false;
  const byMint = new Map<string, TokenHolding>();
  try {
    const [classic, t22] = await Promise.all([
      withRetry(() => conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }, 'confirmed')),
      withRetry(() => conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed')),
    ]);
    for (const [res, programId] of [
      [classic, TOKEN_PROGRAM_ID.toBase58()],
      [t22, TOKEN_2022_PROGRAM_ID.toBase58()],
    ] as const) {
      for (const { pubkey, account } of res.value) {
        const data = account.data as unknown as ParsedTokenAccountData;
        const info = data?.parsed?.info;
        if (!info?.mint || !info.tokenAmount) continue;
        const amount = BigInt(info.tokenAmount.amount);
        const h = byMint.get(info.mint) ?? { mint: info.mint, programId, decimals: info.tokenAmount.decimals, amount: 0n, accounts: [] };
        h.amount += amount;
        h.accounts.push({ address: pubkey.toBase58(), amount });
        byMint.set(info.mint, h);
      }
    }
  } catch {
    tokensPartial = true; // SOL balance below is still correct
  }

  return {
    owner,
    lamports: BigInt(bal.value),
    tokens: [...byMint.values()],
    slot: bal.context.slot,
    tokensPartial,
  };
}
