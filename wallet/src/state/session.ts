/**
 * In-memory session. The decrypted vault lives ONLY here, in a module-scoped variable —
 * never in React state, never in storage, never logged. A page reload, lock or auto-lock
 * discards it. (JavaScript cannot guarantee memory zeroisation; we drop references and
 * wipe byte arrays where possible.)
 */
import type { VaultKey } from '@/lib/crypto/vault';

export type KeyringSecret =
  | { id: string; type: 'mnemonic'; mnemonic: string }
  | { id: string; type: 'privateKey'; secretKey: string };

export interface VaultPayload {
  keyrings: KeyringSecret[];
}

let session: { vk: VaultKey; payload: VaultPayload } | null = null;

export function setSession(vk: VaultKey, payload: VaultPayload) {
  session = { vk, payload };
}

export function getSession() {
  if (!session) throw new Error('Wallet is locked');
  return session;
}

export function hasSession() {
  return session !== null;
}

export function clearSession() {
  if (session) {
    // Overwrite string references we can reach before dropping them.
    session.payload.keyrings = [];
  }
  session = null;
}
