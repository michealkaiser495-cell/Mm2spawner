/**
 * Encrypted vault.
 *
 * Secrets (recovery phrases, private keys) are encrypted with AES-256-GCM using a key
 * derived from the user's password with PBKDF2-HMAC-SHA256 (600,000 iterations, per
 * OWASP 2023 guidance) and a random 16-byte salt. Both primitives come from the
 * platform WebCrypto implementation — no custom cryptography.
 *
 * The derived CryptoKey is created as non-extractable, so it can be held in memory
 * while the wallet is unlocked (to re-encrypt after changes) without its raw bytes
 * ever being readable by JavaScript.
 */
import { base64ToBytes, bytesToBase64, fromUtf8, utf8 } from './encoding';

export const VAULT_VERSION = 1 as const;
export const PBKDF2_ITERATIONS = 600_000;
const AAD = utf8('nocta-vault-v1');

export interface EncryptedVault {
  v: typeof VAULT_VERSION;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export class InvalidPasswordError extends Error {
  constructor() {
    super('Incorrect passcode');
    this.name = 'InvalidPasswordError';
  }
}

export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
  iterations: number = PBKDF2_ITERATIONS,
): Promise<VaultKey> {
  const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so it can be stashed in sessionStorage to survive a page refresh
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iterations };
}

/** Export/import the raw AES key — used to keep the wallet unlocked across a page refresh. */
export async function exportKeyRaw(vk: VaultKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', vk.key)));
}
export async function importVaultKey(rawB64: string, saltB64: string, iterations: number): Promise<VaultKey> {
  const key = await crypto.subtle.importKey('raw', base64ToBytes(rawB64), 'AES-GCM', true, ['encrypt', 'decrypt']);
  return { key, salt: base64ToBytes(saltB64), iterations };
}

/** Decrypt a vault with an already-derived key (no password needed). */
export async function decryptWithKey<T>(vault: EncryptedVault, vk: VaultKey): Promise<T> {
  if (!isEncryptedVault(vault)) throw new Error('Vault data is corrupted');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(vault.cipher.iv), additionalData: AAD }, vk.key, base64ToBytes(vault.data));
  const bytes = new Uint8Array(pt);
  const payload = JSON.parse(fromUtf8(bytes)) as T;
  bytes.fill(0);
  return payload;
}

export async function encryptWithKey<T>(payload: T, vk: VaultKey): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh IV on every write
  const plaintext = utf8(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    vk.key,
    plaintext,
  );
  plaintext.fill(0);
  return {
    v: VAULT_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vk.iterations, salt: bytesToBase64(vk.salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function encryptVault<T>(payload: T, password: string): Promise<{ vault: EncryptedVault; vk: VaultKey }> {
  const vk = await deriveVaultKey(password);
  return { vault: await encryptWithKey(payload, vk), vk };
}

export function isEncryptedVault(x: unknown): x is EncryptedVault {
  const v = x as EncryptedVault;
  return (
    !!v &&
    v.v === VAULT_VERSION &&
    v.kdf?.name === 'PBKDF2' &&
    v.kdf?.hash === 'SHA-256' &&
    typeof v.kdf.salt === 'string' &&
    Number.isInteger(v.kdf.iterations) &&
    v.kdf.iterations >= 100_000 &&
    v.cipher?.name === 'AES-GCM' &&
    typeof v.cipher.iv === 'string' &&
    typeof v.data === 'string'
  );
}

export async function decryptVault<T>(vault: EncryptedVault, password: string): Promise<{ payload: T; vk: VaultKey }> {
  if (!isEncryptedVault(vault)) throw new Error('Vault data is corrupted or uses an unsupported format');
  const vk = await deriveVaultKey(password, base64ToBytes(vault.kdf.salt), vault.kdf.iterations);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(vault.cipher.iv), additionalData: AAD },
      vk.key,
      base64ToBytes(vault.data),
    );
  } catch {
    // AES-GCM authentication failure: wrong password or tampered data.
    throw new InvalidPasswordError();
  }
  const bytes = new Uint8Array(pt);
  const payload = JSON.parse(fromUtf8(bytes)) as T;
  bytes.fill(0);
  return { payload, vk };
}
