import { PublicKey } from '@solana/web3.js';

export type AddressCheck =
  | { valid: false; reason: string }
  | { valid: true; pubkey: PublicKey; onCurve: boolean };

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Well-known program / sysvar addresses that should never receive user transfers. */
const NON_RECIPIENTS = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
  'So11111111111111111111111111111111111111112',
  'SysvarRent111111111111111111111111111111111',
  'SysvarC1ock11111111111111111111111111111111',
  'Vote111111111111111111111111111111111111111',
  'Stake11111111111111111111111111111111111111',
]);

export function checkAddress(input: string): AddressCheck {
  const s = input.trim();
  if (!s) return { valid: false, reason: 'Enter a recipient address' };
  if (s.startsWith('0x')) return { valid: false, reason: 'This looks like an Ethereum/EVM address. Only Solana addresses are supported.' };
  if (/^(bc1|tb1)/i.test(s))
    return { valid: false, reason: 'This looks like a Bitcoin address. Only Solana addresses are supported.' };
  if (!BASE58.test(s)) return { valid: false, reason: 'Not a valid Solana address (base58, 32–44 characters)' };
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(s);
  } catch {
    return { valid: false, reason: 'Not a valid Solana address' };
  }
  if (pubkey.toBase58() !== s) return { valid: false, reason: 'Address is not in canonical form' };
  if (NON_RECIPIENTS.has(s)) return { valid: false, reason: 'This is a system program or token mint address, not a wallet. Funds sent here would be lost.' };
  return { valid: true, pubkey, onCurve: PublicKey.isOnCurve(pubkey.toBytes()) };
}

export function isValidSolanaAddress(input: string): boolean {
  return checkAddress(input).valid;
}
