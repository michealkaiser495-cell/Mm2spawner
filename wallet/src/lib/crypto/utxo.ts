/**
 * UTXO-chain receive-address derivation (Bitcoin, Litecoin, Dogecoin).
 *
 * Standard, portable addresses derived from the SAME BIP-39 phrase used for Solana, so any
 * wallet can send to them. secp256k1 HD derivation via the audited @scure/bip32; hashing and
 * encoding via @noble/hashes and @scure/base. No custom cryptography.
 *
 *   SegWit (BIP-84):  m/84'/{coin}'/0'/0/i  →  bech32  ("bc1…" / "ltc1…")
 *   Legacy (BIP-44):  m/44'/{coin}'/0'/0/i  →  base58  ("1…" / "L…" / "D…")
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58check as base58checkFactory, bech32 } from '@scure/base';
import { normalizeMnemonic } from './keys';

export type UtxoAddressType = 'segwit' | 'legacy';

export interface UtxoChainParams {
  id: string;
  name: string;
  symbol: string;
  coinType: number;
  /** bech32 human-readable part for native SegWit, or null if the chain has no SegWit. */
  bech32Hrp: string | null;
  p2pkhVersion: number; // legacy address version byte
  coingeckoId: string;
  blockcypherChain: string; // path segment in api.blockcypher.com/v1/<chain>/main
}

export const BITCOIN: UtxoChainParams = {
  id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', coinType: 0, bech32Hrp: 'bc', p2pkhVersion: 0x00, coingeckoId: 'bitcoin', blockcypherChain: 'btc',
};
export const LITECOIN: UtxoChainParams = {
  id: 'litecoin', name: 'Litecoin', symbol: 'LTC', coinType: 2, bech32Hrp: 'ltc', p2pkhVersion: 0x30, coingeckoId: 'litecoin', blockcypherChain: 'ltc',
};
export const DOGECOIN: UtxoChainParams = {
  id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', coinType: 3, bech32Hrp: null, p2pkhVersion: 0x1e, coingeckoId: 'dogecoin', blockcypherChain: 'doge',
};

export const UTXO_CHAINS: Record<string, UtxoChainParams> = { bitcoin: BITCOIN, litecoin: LITECOIN, dogecoin: DOGECOIN };

const base58check = base58checkFactory(sha256);

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

function encodeSegwit(hrp: string, program: Uint8Array): string {
  return bech32.encode(hrp, [0, ...bech32.toWords(program)]); // witness v0 + 5-bit program
}

function encodeLegacy(version: number, hash: Uint8Array): string {
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = version;
  payload.set(hash, 1);
  return base58check.encode(payload);
}

function pathFor(type: UtxoAddressType, coinType: number, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Invalid address index');
  return `m/${type === 'segwit' ? 84 : 44}'/${coinType}'/0'/0/${index}`;
}

export function deriveUtxoAddress(mnemonic: string, coin: UtxoChainParams, opts: { type?: UtxoAddressType; index?: number } = {}): string {
  let { type = 'segwit' } = opts;
  const index = opts.index ?? 0;
  if (type === 'segwit' && !coin.bech32Hrp) type = 'legacy'; // chain has no SegWit (e.g. Dogecoin)
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const node = HDKey.fromMasterSeed(seed).derive(pathFor(type, coin.coinType, index));
  if (!node.publicKey) throw new Error('Derivation failed');
  const h160 = hash160(node.publicKey);
  seed.fill(0);
  return type === 'segwit' ? encodeSegwit(coin.bech32Hrp!, h160) : encodeLegacy(coin.p2pkhVersion, h160);
}

export function defaultAddressType(coin: UtxoChainParams): UtxoAddressType {
  return coin.bech32Hrp ? 'segwit' : 'legacy';
}

export function isValidUtxoAddress(coin: UtxoChainParams, addr: string): boolean {
  const a = addr.trim();
  if (coin.bech32Hrp && a.toLowerCase().startsWith(coin.bech32Hrp + '1')) {
    try {
      const { prefix, words } = bech32.decode(a as `${string}1${string}`, 120);
      return prefix === coin.bech32Hrp && words[0] === 0;
    } catch {
      return false;
    }
  }
  // Legacy base58check with the chain's version byte.
  try {
    const bytes = base58check.decode(a);
    return bytes.length === 21 && bytes[0] === coin.p2pkhVersion;
  } catch {
    return false;
  }
}

export function utxoExplorerAddressUrl(coin: UtxoChainParams, addr: string): string {
  return `https://blockchair.com/${coin.id}/address/${encodeURIComponent(addr)}`;
}
export function utxoExplorerTxUrl(coin: UtxoChainParams, txid: string): string {
  return `https://blockchair.com/${coin.id}/transaction/${encodeURIComponent(txid)}`;
}
