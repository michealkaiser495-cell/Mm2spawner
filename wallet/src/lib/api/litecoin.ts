/**
 * Litecoin read-only data via BlockCypher's public API (balances + recent transactions) and
 * CoinGecko (price). Only the public LTC address is ever sent. Receive-only: Nocta does not
 * build or sign Litecoin transactions yet.
 */
import { getJson } from './http';

const BLOCKCYPHER = 'https://api.blockcypher.com/v1/ltc/main';
export const LITOSHIS_PER_LTC = 100_000_000n;

export interface LtcTx {
  hash: string;
  value: bigint; // signed litoshis, relative to the address
  confirmations: number;
  confirmed: string | null; // ISO timestamp or null if unconfirmed
}

export interface LtcAccount {
  address: string;
  balance: bigint; // confirmed litoshis
  unconfirmed: bigint;
  totalReceived: bigint;
  txCount: number;
  txs: LtcTx[];
}

interface BcAddress {
  address: string;
  balance: number;
  unconfirmed_balance: number;
  total_received: number;
  n_tx: number;
  txrefs?: { tx_hash: string; value: number; confirmations: number; confirmed?: string; tx_input_n: number; spent?: boolean }[];
  unconfirmed_txrefs?: { tx_hash: string; value: number; confirmations: number; confirmed?: string; tx_input_n: number }[];
}

export async function fetchLtcAccount(address: string): Promise<LtcAccount> {
  const d = await getJson<BcAddress>(`${BLOCKCYPHER}/addrs/${encodeURIComponent(address)}?limit=20`);
  const refs = [...(d.unconfirmed_txrefs ?? []), ...(d.txrefs ?? [])];
  // Collapse multiple refs of the same tx into one signed row (input = outgoing, output = incoming).
  const byTx = new Map<string, LtcTx>();
  for (const r of refs) {
    const signed = BigInt(r.value) * (r.tx_input_n >= 0 ? -1n : 1n);
    const existing = byTx.get(r.tx_hash);
    if (existing) existing.value += signed;
    else byTx.set(r.tx_hash, { hash: r.tx_hash, value: signed, confirmations: r.confirmations, confirmed: r.confirmed ?? null });
  }
  return {
    address: d.address,
    balance: BigInt(d.balance),
    unconfirmed: BigInt(d.unconfirmed_balance),
    totalReceived: BigInt(d.total_received),
    txCount: d.n_tx,
    txs: [...byTx.values()].slice(0, 15),
  };
}

export async function fetchLtcPrice(vsCurrency = 'usd'): Promise<number | undefined> {
  const d = await getJson<Record<string, Record<string, number>>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=${encodeURIComponent(vsCurrency)}`,
  );
  return d.litecoin?.[vsCurrency];
}
