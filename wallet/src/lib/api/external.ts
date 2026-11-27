/**
 * Read-only balance / history / price for external receive chains.
 *   - UTXO (BTC, LTC, DOGE): BlockCypher public API.
 *   - EVM (ETH, Base, Polygon, Arbitrum): JSON-RPC eth_getBalance (+ explorer link for history).
 *   - Prices: CoinGecko simple price.
 * Only public addresses are ever sent.
 */
import { getJson } from './http';
import type { EvmChainParams } from '../crypto/evm';
import { EVM_CHAINS } from '../crypto/evm';
import type { UtxoChainParams } from '../crypto/utxo';
import { UTXO_CHAINS } from '../crypto/utxo';

export interface ExternalTx {
  hash: string;
  value: bigint; // signed base units relative to the address
  confirmations: number;
  timestamp: number | null; // unix seconds
}

export interface ExternalAccount {
  address: string;
  balance: bigint; // confirmed base units
  unconfirmed: bigint;
  txCount: number;
  txs: ExternalTx[];
}

// ---------------------------------------------------------------- UTXO (BlockCypher)

interface BcAddress {
  address: string;
  balance: number;
  unconfirmed_balance: number;
  n_tx: number;
  txrefs?: { tx_hash: string; value: number; confirmations: number; confirmed?: string; tx_input_n: number }[];
  unconfirmed_txrefs?: { tx_hash: string; value: number; confirmations: number; confirmed?: string; tx_input_n: number }[];
}

export async function fetchUtxoAccount(coin: UtxoChainParams, address: string): Promise<ExternalAccount> {
  const d = await getJson<BcAddress>(`https://api.blockcypher.com/v1/${coin.blockcypherChain}/main/addrs/${encodeURIComponent(address)}?limit=20`);
  const byTx = new Map<string, ExternalTx>();
  for (const r of [...(d.unconfirmed_txrefs ?? []), ...(d.txrefs ?? [])]) {
    const signed = BigInt(r.value) * (r.tx_input_n >= 0 ? -1n : 1n); // input = spend, output = receive
    const e = byTx.get(r.tx_hash);
    if (e) e.value += signed;
    else byTx.set(r.tx_hash, { hash: r.tx_hash, value: signed, confirmations: r.confirmations, timestamp: r.confirmed ? Math.floor(new Date(r.confirmed).getTime() / 1000) : null });
  }
  return {
    address: d.address,
    balance: BigInt(d.balance),
    unconfirmed: BigInt(d.unconfirmed_balance),
    txCount: d.n_tx,
    txs: [...byTx.values()].slice(0, 15),
  };
}

// ---------------------------------------------------------------- EVM (JSON-RPC)

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await getJson<{ result?: T; error?: { message: string } }>(url, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (r.error) throw new Error(r.error.message);
  return r.result as T;
}

export async function fetchEvmAccount(chain: EvmChainParams, address: string): Promise<ExternalAccount> {
  const [balHex, nonceHex] = await Promise.all([
    rpc<string>(chain.rpc, 'eth_getBalance', [address, 'latest']),
    rpc<string>(chain.rpc, 'eth_getTransactionCount', [address, 'latest']).catch(() => '0x0'),
  ]);
  return {
    address,
    balance: BigInt(balHex),
    unconfirmed: 0n,
    txCount: Number(BigInt(nonceHex)),
    txs: [], // full EVM history needs an indexer/API key; the Explorer link covers it.
  };
}

export async function fetchExternalAccount(chainId: string, address: string): Promise<ExternalAccount> {
  if (UTXO_CHAINS[chainId]) return fetchUtxoAccount(UTXO_CHAINS[chainId], address);
  if (EVM_CHAINS[chainId]) return fetchEvmAccount(EVM_CHAINS[chainId], address);
  throw new Error(`Unsupported chain: ${chainId}`);
}

// ---------------------------------------------------------------- prices

export async function fetchSimplePrices(coingeckoIds: string[], vs = 'usd'): Promise<Record<string, number>> {
  const ids = [...new Set(coingeckoIds)].join(',');
  if (!ids) return {};
  const d = await getJson<Record<string, Record<string, number>>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`,
  );
  const out: Record<string, number> = {};
  for (const [id, m] of Object.entries(d)) if (typeof m[vs] === 'number') out[id] = m[vs];
  return out;
}

// ---------------------------------------------------------------- UTXO send support (BlockCypher)

import type { Utxo } from '../chains/utxoSend';

interface BcUnspent {
  txrefs?: { tx_hash: string; tx_output_n: number; value: number; script?: string }[];
  unconfirmed_txrefs?: { tx_hash: string; tx_output_n: number; value: number; script?: string }[];
}

/** Confirmed unspent outputs for a UTXO address (with their scripts). */
export async function fetchUtxos(coin: UtxoChainParams, address: string): Promise<Utxo[]> {
  const d = await getJson<BcUnspent>(`https://api.blockcypher.com/v1/${coin.blockcypherChain}/main/addrs/${encodeURIComponent(address)}?unspentOnly=true&includeScript=true&limit=50`);
  return (d.txrefs ?? []).map((r) => ({ txid: r.tx_hash, vout: r.tx_output_n, value: BigInt(r.value), scriptHex: r.script ?? '' }));
}

/** Raw hex of a previous transaction (needed to sign legacy / non-SegWit inputs). */
export async function fetchPrevTxHex(coin: UtxoChainParams, txid: string): Promise<string> {
  const d = await getJson<{ hex: string }>(`https://api.blockcypher.com/v1/${coin.blockcypherChain}/main/txs/${encodeURIComponent(txid)}?includeHex=true&limit=1`);
  return d.hex;
}

/** Cheapest reasonable fee rate (sat/vByte), from the chain's low-priority estimate. */
export async function fetchUtxoFeeRate(coin: UtxoChainParams): Promise<bigint> {
  const d = await getJson<{ low_fee_per_kb: number }>(`https://api.blockcypher.com/v1/${coin.blockcypherChain}/main`);
  const perByte = Math.floor((d.low_fee_per_kb ?? 1000) / 1000);
  return BigInt(Math.max(1, perByte)); // floor of 1 sat/vByte
}

/** Broadcast a signed raw transaction. Returns the txid. */
export async function broadcastUtxoTx(coin: UtxoChainParams, txHex: string): Promise<string> {
  const d = await getJson<{ tx?: { hash: string }; error?: string }>(`https://api.blockcypher.com/v1/${coin.blockcypherChain}/main/txs/push`, {
    method: 'POST',
    body: JSON.stringify({ tx: txHex }),
  });
  if (!d.tx?.hash) throw new Error(d.error || 'Broadcast failed');
  return d.tx.hash;
}
