/**
 * Litecoin receive-address derivation (receive only).
 *
 * Nocta derives a standard, portable Litecoin address from the SAME BIP-39 recovery phrase
 * used for Solana, so any wallet can send LTC to it. secp256k1 HD derivation uses the audited
 * @scure/bip32; hashing and address encoding use @noble/hashes and @scure/base. No custom
 * cryptography.
 *
 * Paths (BIP-44 coin type 2 = Litecoin):
 *   - Native SegWit (BIP-84): m/84'/2'/0'/0/i  →  bech32 "ltc1…"  (default, lowest fees)
 *   - Legacy     (BIP-44): m/44'/2'/0'/0/i  →  base58  "L…"
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58check as base58checkFactory, bech32 } from '@scure/base';
import { normalizeMnemonic } from './keys';

export type LtcAddressType = 'segwit' | 'legacy';

const base58check = base58checkFactory(sha256);

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** Encode a witness-v0 program as a bech32 address (segwit). */
function encodeSegwit(hrp: string, program: Uint8Array): string {
  const words = [0, ...bech32.toWords(program)]; // witness version 0 + 5-bit program
  return bech32.encode(hrp, words);
}

/** Encode a legacy P2PKH address (base58check with a version byte). */
function encodeLegacy(version: number, hash: Uint8Array): string {
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = version;
  payload.set(hash, 1);
  return base58check.encode(payload);
}

export interface CoinParams {
  coinType: number;
  bech32Hrp: string;
  p2pkhVersion: number;
}

export const LITECOIN: CoinParams = { coinType: 2, bech32Hrp: 'ltc', p2pkhVersion: 0x30 };
// Bitcoin params are kept only so the derivation pipeline can be checked against BIP-84 test vectors.
export const BITCOIN: CoinParams = { coinType: 0, bech32Hrp: 'bc', p2pkhVersion: 0x00 };

function pathFor(type: LtcAddressType, coinType: number, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Invalid address index');
  const purpose = type === 'segwit' ? 84 : 44;
  return `m/${purpose}'/${coinType}'/0'/0/${index}`;
}

export function deriveAddress(mnemonic: string, opts: { type?: LtcAddressType; index?: number; coin?: CoinParams } = {}): string {
  const { type = 'segwit', index = 0, coin = LITECOIN } = opts;
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const node = HDKey.fromMasterSeed(seed).derive(pathFor(type, coin.coinType, index));
  if (!node.publicKey) throw new Error('Derivation failed');
  const h160 = hash160(node.publicKey); // publicKey is the 33-byte compressed key
  seed.fill(0);
  return type === 'segwit' ? encodeSegwit(coin.bech32Hrp, h160) : encodeLegacy(coin.p2pkhVersion, h160);
}

export function deriveLitecoinAddress(mnemonic: string, type: LtcAddressType = 'segwit', index = 0): string {
  return deriveAddress(mnemonic, { type, index, coin: LITECOIN });
}

const LTC_SEGWIT = /^ltc1[0-9ac-hj-np-z]{6,87}$/;
const LTC_LEGACY = /^[LM][1-9A-HJ-NP-Za-km-z]{25,39}$/; // L… (P2PKH) or M… (P2SH)

export function isValidLitecoinAddress(addr: string): boolean {
  const a = addr.trim();
  if (LTC_SEGWIT.test(a)) {
    try {
      const { prefix, words } = bech32.decode(a as `ltc1${string}`);
      return prefix === 'ltc' && words[0] === 0;
    } catch {
      return false;
    }
  }
  if (LTC_LEGACY.test(a)) {
    try {
      base58check.decode(a);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function ltcExplorerAddressUrl(addr: string): string {
  return `https://blockchair.com/litecoin/address/${encodeURIComponent(addr)}`;
}

export function ltcExplorerTxUrl(txid: string): string {
  return `https://blockchair.com/litecoin/transaction/${encodeURIComponent(txid)}`;
}
