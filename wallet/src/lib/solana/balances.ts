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
}

interface ParsedTokenAccountData {
  parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } };
}

export async function fetchPortfolio(conn: Connection, owner: string): Promise<OnchainPortfolio> {
  const pk = new PublicKey(owner);
  const [bal, classic, t22] = await Promise.all([
    conn.getBalanceAndContext(pk),
    conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }),
    conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const byMint = new Map<string, TokenHolding>();
  for (const [res, programId] of [
    [classic, TOKEN_PROGRAM_ID.toBase58()],
    [t22, TOKEN_2022_PROGRAM_ID.toBase58()],
  ] as const) {
    for (const { pubkey, account } of res.value) {
      const data = account.data as unknown as ParsedTokenAccountData;
      const info = data?.parsed?.info;
      if (!info?.mint || !info.tokenAmount) continue;
      const amount = BigInt(info.tokenAmount.amount);
      const h = byMint.get(info.mint) ?? {
        mint: info.mint,
        programId,
        decimals: info.tokenAmount.decimals,
        amount: 0n,
        accounts: [],
      };
      h.amount += amount;
      h.accounts.push({ address: pubkey.toBase58(), amount });
      byMint.set(info.mint, h);
    }
  }

  return {
    owner,
    lamports: BigInt(bal.value),
    tokens: [...byMint.values()],
    slot: bal.context.slot,
  };
}
