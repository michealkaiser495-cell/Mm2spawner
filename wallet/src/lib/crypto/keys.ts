/**
 * Key generation & derivation.
 *  - BIP-39 recovery phrases via @scure/bip39 (audited).
 *  - SLIP-0010 ed25519 derivation via micro-key-producer (audited, by the @noble author).
 *  - Solana derivation path m/44'/501'/{account}'/0' — the de-facto standard used by
 *    major Solana wallets, so phrases are portable between wallets.
 */
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from 'micro-key-producer/slip10.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { wipe } from './encoding';

export const WORDLIST = wordlist;

export function solanaPath(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Invalid account index');
  return `m/44'/501'/${index}'/0'`;
}

/**
 * Solana derivation schemes. The SAME seed phrase yields DIFFERENT addresses depending on the
 * path a wallet uses, which is why an Exodus/Ledger/Trust phrase can look like an empty "new"
 * account when imported with only Phantom's path. All segments are hardened (required by
 * SLIP-0010 ed25519). On import, Nocta scans these and keeps whichever addresses hold funds.
 */
export type SolScheme = 'bip44-0-0' | 'bip44-0' | 'bip44-root';

export interface SolSchemeDef {
  id: SolScheme;
  label: string;
  hint: string;
  path: (index: number) => string;
  indexable: boolean; // whether deriving multiple accounts (index > 0) is meaningful
}

export const SOL_SCHEMES: SolSchemeDef[] = [
  { id: 'bip44-0-0', label: "m/44'/501'/x'/0'", hint: 'Phantom, Solflare, Backpack, Exodus', path: (i) => `m/44'/501'/${i}'/0'`, indexable: true },
  { id: 'bip44-0', label: "m/44'/501'/x'", hint: 'Trust Wallet, Ledger Live, Coinbase Wallet', path: (i) => `m/44'/501'/${i}'`, indexable: true },
  { id: 'bip44-root', label: "m/44'/501'", hint: 'Some legacy wallets', path: () => `m/44'/501'`, indexable: false },
];

export const DEFAULT_SOL_SCHEME: SolScheme = 'bip44-0-0';

export function solSchemeDef(scheme: SolScheme = DEFAULT_SOL_SCHEME): SolSchemeDef {
  return SOL_SCHEMES.find((s) => s.id === scheme) ?? SOL_SCHEMES[0];
}

export function solanaPathFor(scheme: SolScheme, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Invalid account index');
  return solSchemeDef(scheme).path(index);
}

export function createMnemonic(words: 12 | 24 = 12): string {
  return generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

/** Lowercase, trim, collapse whitespace — tolerant of pasted phrases. */
export function normalizeMnemonic(input: string): string {
  return input.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidMnemonic(input: string): boolean {
  const m = normalizeMnemonic(input);
  const n = m.split(' ').length;
  if (![12, 15, 18, 21, 24].includes(n)) return false;
  return validateMnemonic(m, wordlist);
}

export function keypairFromMnemonic(mnemonic: string, index: number, scheme: SolScheme = DEFAULT_SOL_SCHEME): Keypair {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const node = HDKey.fromMasterSeed(seed).derive(solanaPathFor(scheme, index));
  const kp = Keypair.fromSeed(node.privateKey);
  wipe(seed);
  return kp;
}

export function publicKeyFromMnemonic(mnemonic: string, index: number, scheme: SolScheme = DEFAULT_SOL_SCHEME): string {
  return keypairFromMnemonic(mnemonic, index, scheme).publicKey.toBase58();
}

/**
 * Parse a Solana private key. Accepts:
 *  - base58-encoded 64-byte secret key (common wallet export format)
 *  - JSON byte array of 64 numbers (solana-keygen id.json format)
 * The embedded public key is verified against the secret.
 */
export function parsePrivateKey(input: string): Keypair {
  const raw = input.trim();
  let bytes: Uint8Array;
  if (raw.startsWith('[')) {
    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch {
      throw new Error('Invalid key: malformed JSON array');
    }
    if (!Array.isArray(arr) || !arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new Error('Invalid key: expected an array of bytes');
    }
    bytes = Uint8Array.from(arr as number[]);
  } else {
    try {
      bytes = bs58.decode(raw);
    } catch {
      throw new Error('Invalid key: not valid base58');
    }
  }
  if (bytes.length !== 64) {
    wipe(bytes);
    throw new Error('Invalid key: a Solana secret key is 64 bytes');
  }
  try {
    // Keypair keeps a reference to the array it is given, so hand it a copy and wipe ours.
    return Keypair.fromSecretKey(Uint8Array.from(bytes)); // validates pubkey half matches secret
  } catch {
    throw new Error('Invalid key: public key does not match secret key');
  } finally {
    wipe(bytes);
  }
}

export function encodeSecretKey(kp: Keypair): string {
  return bs58.encode(kp.secretKey);
}
