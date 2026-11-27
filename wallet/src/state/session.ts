/**
 * In-memory session. The decrypted vault lives in a module-scoped variable — never in React
 * state, never logged.
 *
 * To avoid re-entering the passcode on every page refresh, the derived AES key is also stashed
 * in `sessionStorage` (origin-scoped, and automatically cleared when the tab/browser is closed).
 * On refresh it is re-imported and used to decrypt the vault. This is a convenience/security
 * trade-off: closing the tab, locking, or the inactivity auto-lock all clear it.
 */
import { exportKeyRaw, type VaultKey } from '@/lib/crypto/vault';

export type KeyringSecret =
  | { id: string; type: 'mnemonic'; mnemonic: string }
  | { id: string; type: 'privateKey'; secretKey: string };

export interface VaultPayload {
  keyrings: KeyringSecret[];
}

const SESSION_KEY = 'nocta:session:v1';

let session: { vk: VaultKey; payload: VaultPayload } | null = null;

export function setSession(vk: VaultKey, payload: VaultPayload) {
  session = { vk, payload };
  // Persist the key for refresh survival (best-effort, async).
  void persistSessionKey(vk);
}

async function persistSessionKey(vk: VaultKey) {
  try {
    const raw = await exportKeyRaw(vk);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ k: raw, salt: bytesSalt(vk), iter: vk.iterations }));
  } catch {
    /* sessionStorage blocked / export failed — wallet simply re-locks on refresh */
  }
}

function bytesSalt(vk: VaultKey): string {
  let bin = '';
  for (const b of vk.salt) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function readStoredSessionKey(): { k: string; salt: string; iter: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return v && typeof v.k === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function restoreSession(vk: VaultKey, payload: VaultPayload) {
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
  if (session) session.payload.keyrings = [];
  session = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
