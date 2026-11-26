import type {
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Clusters now serve v1 transactions; web3.js v1 types only declare v0 but parse v1
 * jsonParsed responses correctly. Request the highest version we can display.
 */
const MAX_TX_VERSION = 1 as unknown as 0;

export type ActivityType = 'send' | 'receive' | 'swap' | 'self' | 'interaction';

export interface BalanceChange {
  /** 'SOL' for native lamports, otherwise SPL mint */
  mint: string;
  /** signed change in base units, excluding network fee */
  delta: bigint;
  decimals: number;
}

export interface Activity {
  signature: string;
  slot: number;
  blockTime: number | null;
  status: 'success' | 'failed';
  error?: string;
  fee: bigint;
  feePaidByOwner: boolean;
  type: ActivityType;
  changes: BalanceChange[];
  counterparty?: string;
  programs: string[];
}

type Ix = ParsedInstruction | PartiallyDecodedInstruction;

function counterpartyFrom(ixs: Ix[], owner: string, ownerTokenAccounts: Set<string>): string | undefined {
  for (const ix of ixs) {
    if (!('parsed' in ix) || typeof ix.parsed !== 'object' || !ix.parsed) continue;
    const { type, info } = ix.parsed as { type: string; info: Record<string, string> };
    if (type !== 'transfer' && type !== 'transferChecked') continue;
    if (ix.program === 'system') {
      if (info.source === owner && info.destination !== owner) return info.destination;
      if (info.destination === owner && info.source !== owner) return info.source;
    } else if (ix.program === 'spl-token' || ix.program === 'spl-token-2022') {
      const fromOwner = info.authority === owner || info.multisigAuthority === owner || ownerTokenAccounts.has(info.source);
      if (fromOwner) return info.destination;
      if (ownerTokenAccounts.has(info.destination)) return info.authority ?? info.source;
    }
  }
  return undefined;
}

/** Derive a human-meaningful activity record from a parsed transaction, relative to `owner`. */
export function parseActivity(tx: ParsedTransactionWithMeta, signature: string, owner: string): Activity {
  const meta = tx.meta;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const feePayer = keys[0];
  const fee = BigInt(meta?.fee ?? 0);
  const feePaidByOwner = feePayer === owner;
  const changes: BalanceChange[] = [];

  const idx = keys.indexOf(owner);
  if (idx >= 0 && meta) {
    let d = BigInt(meta.postBalances[idx] ?? 0) - BigInt(meta.preBalances[idx] ?? 0);
    if (feePaidByOwner) d += fee; // show transfer amount separately from fee
    if (d !== 0n) changes.push({ mint: 'SOL', delta: d, decimals: 9 });
  }

  const ownerTokenAccounts = new Set<string>();
  const tokenDelta = new Map<string, { delta: bigint; decimals: number }>();
  for (const [list, sign] of [
    [meta?.preTokenBalances ?? [], -1n],
    [meta?.postTokenBalances ?? [], 1n],
  ] as const) {
    for (const b of list) {
      if (b.owner !== owner) continue;
      ownerTokenAccounts.add(keys[b.accountIndex]);
      const cur = tokenDelta.get(b.mint) ?? { delta: 0n, decimals: b.uiTokenAmount.decimals };
      cur.delta += sign * BigInt(b.uiTokenAmount.amount);
      tokenDelta.set(b.mint, cur);
    }
  }
  for (const [mint, v] of tokenDelta) if (v.delta !== 0n) changes.push({ mint, ...v });

  // Wrapped-SOL round trips appear as a token change + SOL change; keep both but classify by sign.
  const pos = changes.filter((c) => c.delta > 0n);
  const neg = changes.filter((c) => c.delta < 0n);
  let type: ActivityType;
  if (pos.length && neg.length) type = 'swap';
  else if (neg.length) type = 'send';
  else if (pos.length) type = 'receive';
  else type = 'interaction';

  const ixs = tx.transaction.message.instructions as Ix[];
  const inner = (meta?.innerInstructions ?? []).flatMap((i) => i.instructions as Ix[]);
  const counterparty = counterpartyFrom([...ixs, ...inner], owner, ownerTokenAccounts);
  if ((type === 'send' || type === 'interaction') && counterparty === owner) type = 'self';

  const programs = [...new Set(ixs.map((i) => i.programId.toBase58()))];
  const err = meta?.err;
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    status: err ? 'failed' : 'success',
    error: err ? JSON.stringify(err) : undefined,
    fee,
    feePaidByOwner,
    type,
    changes,
    counterparty,
    programs,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry on RPC rate limiting (public endpoints throttle batched history calls). */
async function withBackoff<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1 || !/429|too many/i.test((e as Error).message)) throw e;
      await sleep(600 * 2 ** i);
    }
  }
}

export interface HistoryPage {
  items: Activity[];
  nextBefore?: string;
}

export async function fetchHistory(
  conn: Connection,
  owner: string,
  opts: { before?: string; limit?: number } = {},
): Promise<HistoryPage> {
  const limit = opts.limit ?? 20;
  const sigs = await withBackoff(() => conn.getSignaturesForAddress(new PublicKey(owner), { before: opts.before, limit }));
  if (sigs.length === 0) return { items: [] };
  // Fetch in small batches to stay within public RPC limits. If a batch fails (e.g. an
  // unsupported future transaction version), fall back to one-by-one so a single odd
  // transaction never hides the whole history.
  const items: Activity[] = [];
  const opts2 = { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' as const };
  const BATCH = 5;
  for (let i = 0; i < sigs.length; i += BATCH) {
    const batch = sigs.slice(i, i + BATCH);
    let txs: (ParsedTransactionWithMeta | null)[];
    try {
      txs = await withBackoff(() => conn.getParsedTransactions(batch.map((s) => s.signature), opts2));
    } catch (e) {
      if (/429|too many/i.test((e as Error).message)) throw e;
      txs = await Promise.all(batch.map((s) => conn.getParsedTransaction(s.signature, opts2).catch(() => null)));
    }
    txs.forEach((tx, j) => {
      const s = batch[j];
      let parsed: Activity | null = null;
      try {
        parsed = tx ? parseActivity(tx, s.signature, owner) : null;
      } catch {
        parsed = null;
      }
      items.push(
        parsed ?? {
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          status: s.err ? 'failed' : 'success',
          error: s.err ? JSON.stringify(s.err) : undefined,
          fee: 0n,
          feePaidByOwner: false,
          type: 'interaction',
          changes: [],
          programs: [],
        },
      );
    });
  }
  return { items, nextBefore: sigs.length === limit ? sigs[sigs.length - 1].signature : undefined };
}

export async function fetchActivity(conn: Connection, signature: string, owner: string): Promise<Activity | null> {
  const tx = await conn.getParsedTransaction(signature, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' });
  return tx ? parseActivity(tx, signature, owner) : null;
}
