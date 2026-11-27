import { create } from 'zustand';
import type { Keypair } from '@solana/web3.js';
import { decryptVault, decryptWithKey, encryptVault, encryptWithKey, importVaultKey, type EncryptedVault, InvalidPasswordError, isEncryptedVault } from '@/lib/crypto/vault';
import { DEFAULT_SOL_SCHEME, encodeSecretKey, isValidMnemonic, keypairFromMnemonic, normalizeMnemonic, parsePrivateKey, SOL_SCHEMES, type SolScheme } from '@/lib/crypto/keys';
import { type LtcAddressType } from '@/lib/crypto/litecoin';
import { getExternalChain } from '@/lib/chains/external';
import { randomId } from '@/lib/crypto/encoding';
import { clearSession, getSession, hasSession, readStoredSessionKey, restoreSession, setSession, type KeyringSecret, type VaultPayload } from './session';

const VAULT_KEY = 'nocta:vault:v1';
const META_KEY = 'nocta:meta:v1';
const THROTTLE_KEY = 'nocta:unlock:v1';

export interface Account {
  id: string;
  name: string;
  keyringId: string;
  index?: number; // derivation index for mnemonic keyrings
  scheme?: SolScheme; // Solana derivation scheme (default Phantom-style); set for alternate paths
  publicKey: string;
  createdAt: number;
}

export interface KeyringMeta {
  id: string;
  type: 'mnemonic' | 'privateKey';
  label: string;
  backedUp: boolean;
  nextIndex: number;
  createdAt: number;
}

interface Meta {
  accounts: Account[];
  keyrings: KeyringMeta[];
  activeAccountId: string | null;
}

export type WalletStatus = 'empty' | 'locked' | 'unlocked';

interface WalletState extends Meta {
  status: WalletStatus;
  restoring: boolean;
  restoreSession: () => Promise<void>;
  // lifecycle
  createVault: (opts: { password: string; secret: NewSecret; accountName?: string }) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  verifyPassword: (password: string) => Promise<boolean>;
  changePassword: (oldPw: string, newPw: string) => Promise<void>;
  resetAll: () => void;
  // accounts
  addKeyring: (secret: NewSecret, accountName?: string) => Promise<Account>;
  deriveNextAccount: (keyringId: string, name?: string) => Promise<Account>;
  discoverAccounts: (keyringId: string, hasActivity: (publicKey: string) => Promise<boolean>, maxGap?: number) => Promise<number>;
  discoverSolanaSchemes: (keyringId: string, hasActivity: (publicKey: string) => Promise<boolean>) => Promise<number>;
  renameAccount: (id: string, name: string) => void;
  removeAccount: (id: string) => Promise<void>;
  setActiveAccount: (id: string) => void;
  markBackedUp: (keyringId: string) => void;
  // secrets (never stored in state)
  revealSecret: (password: string, keyringId: string) => Promise<KeyringSecret>;
  revealPrivateKey: (password: string, accountId: string) => Promise<string>;
  getKeypair: (accountId: string) => Keypair;
  getExternalAddress: (accountId: string, chainId: string, variant?: string) => string | null;
  getMnemonicForAccount: (accountId: string) => { mnemonic: string; index: number } | null;
  getLitecoinAddress: (accountId: string, type?: LtcAddressType) => string | null;
}

export type NewSecret =
  | { type: 'mnemonic'; mnemonic: string; backedUp: boolean }
  | { type: 'privateKey'; secretKey: string };

// ---------------------------------------------------------------- persistence

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (m && Array.isArray(m.accounts) && Array.isArray(m.keyrings)) return m;
  } catch {
    /* fallthrough */
  }
  return { accounts: [], keyrings: [], activeAccountId: null };
}

function writeMeta(m: Meta) {
  localStorage.setItem(META_KEY, JSON.stringify({ accounts: m.accounts, keyrings: m.keyrings, activeAccountId: m.activeAccountId }));
}

function readVault(): EncryptedVault | null {
  try {
    const v = JSON.parse(localStorage.getItem(VAULT_KEY) || 'null');
    return isEncryptedVault(v) ? v : null;
  } catch {
    return null;
  }
}

async function persistSession() {
  const s = getSession();
  const enc = await encryptWithKey(s.payload, s.vk);
  localStorage.setItem(VAULT_KEY, JSON.stringify(enc));
}

// ---------------------------------------------------------------- unlock throttling

interface Throttle {
  failures: number;
  last: number;
}
function readThrottle(): Throttle {
  try {
    return JSON.parse(localStorage.getItem(THROTTLE_KEY) || '') as Throttle;
  } catch {
    return { failures: 0, last: 0 };
  }
}
/** Milliseconds the user must wait before another unlock attempt. */
export function unlockWaitMs(): number {
  const t = readThrottle();
  if (t.failures < 3) return 0;
  const wait = Math.min(2 ** (t.failures - 3), 300) * 1000;
  return Math.max(0, t.last + wait - Date.now());
}

// ---------------------------------------------------------------- helpers

function materialise(secret: NewSecret): { keyring: KeyringSecret; firstPublicKey: string } {
  const id = randomId();
  if (secret.type === 'mnemonic') {
    const mnemonic = normalizeMnemonic(secret.mnemonic);
    if (!isValidMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
    return { keyring: { id, type: 'mnemonic', mnemonic }, firstPublicKey: keypairFromMnemonic(mnemonic, 0).publicKey.toBase58() };
  }
  const kp = parsePrivateKey(secret.secretKey);
  const pk = kp.publicKey.toBase58();
  const encoded = encodeSecretKey(kp);
  kp.secretKey.fill(0);
  return { keyring: { id, type: 'privateKey', secretKey: encoded }, firstPublicKey: pk };
}

function keypairFor(account: Account): Keypair {
  const kr = getSession().payload.keyrings.find((k) => k.id === account.keyringId);
  if (!kr) throw new Error('Key material for this account is missing');
  if (kr.type === 'mnemonic') return keypairFromMnemonic(kr.mnemonic, account.index ?? 0, account.scheme ?? DEFAULT_SOL_SCHEME);
  return parsePrivateKey(kr.secretKey);
}

const initialMeta = readMeta();
const initialStatus: WalletStatus = readVault() ? 'locked' : 'empty';
const initialRestoring = initialStatus === 'locked' && !!readStoredSessionKey();

export const useWallet = create<WalletState>((set, get) => {
  const commitMeta = (patch: Partial<Meta>) => {
    set(patch);
    const { accounts, keyrings, activeAccountId } = get();
    writeMeta({ accounts, keyrings, activeAccountId });
  };

  const newAccountMeta = (keyringId: string, publicKey: string, index: number | undefined, name?: string, scheme?: SolScheme): Account => ({
    id: randomId(),
    name: name?.trim() || `Account ${get().accounts.length + 1}`,
    keyringId,
    index,
    scheme,
    publicKey,
    createdAt: Date.now(),
  });

  return {
    ...initialMeta,
    status: initialStatus,
    restoring: initialRestoring,

    async createVault({ password, secret, accountName }) {
      if (readVault()) throw new Error('A wallet already exists on this device');
      const { keyring, firstPublicKey } = materialise(secret);
      const payload: VaultPayload = { keyrings: [keyring] };
      const { vault, vk } = await encryptVault(payload, password);
      localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
      localStorage.removeItem(THROTTLE_KEY);
      setSession(vk, payload);
      const krMeta: KeyringMeta = {
        id: keyring.id,
        type: keyring.type,
        label: keyring.type === 'mnemonic' ? 'Recovery phrase 1' : 'Imported key',
        backedUp: secret.type === 'mnemonic' ? secret.backedUp : true,
        nextIndex: keyring.type === 'mnemonic' ? 1 : 0,
        createdAt: Date.now(),
      };
      const acct: Account = { ...newAccountMeta(keyring.id, firstPublicKey, keyring.type === 'mnemonic' ? 0 : undefined, accountName), name: accountName?.trim() || 'Account 1' };
      set({ status: 'unlocked' });
      commitMeta({ accounts: [acct], keyrings: [krMeta], activeAccountId: acct.id });
    },

    async unlock(password) {
      const wait = unlockWaitMs();
      if (wait > 0) throw new Error(`Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`);
      const vault = readVault();
      if (!vault) throw new Error('No wallet found on this device');
      try {
        const { payload, vk } = await decryptVault<VaultPayload>(vault, password);
        setSession(vk, payload);
        localStorage.removeItem(THROTTLE_KEY);
        const meta = readMeta();
        set({ ...meta, status: 'unlocked', activeAccountId: meta.activeAccountId ?? meta.accounts[0]?.id ?? null });
      } catch (e) {
        if (e instanceof InvalidPasswordError) {
          const t = readThrottle();
          localStorage.setItem(THROTTLE_KEY, JSON.stringify({ failures: (t.failures || 0) + 1, last: Date.now() }));
        }
        throw e;
      }
    },

    /** Restore an unlocked session from sessionStorage after a page refresh (no passcode needed). */
    async restoreSession() {
      if (!get().restoring) return;
      const stored = readStoredSessionKey();
      const vault = readVault();
      try {
        if (!stored || !vault) throw new Error('no session');
        const vk = await importVaultKey(stored.k, stored.salt, stored.iter);
        const payload = await decryptWithKey<VaultPayload>(vault, vk);
        restoreSession(vk, payload);
        const meta = readMeta();
        set({ ...meta, status: 'unlocked', restoring: false, activeAccountId: meta.activeAccountId ?? meta.accounts[0]?.id ?? null });
      } catch {
        clearSession();
        set({ restoring: false });
      }
    },

    lock() {
      clearSession();
      set({ restoring: false });
      if (get().status === 'unlocked') set({ status: 'locked' });
    },

    async verifyPassword(password) {
      const vault = readVault();
      if (!vault) return false;
      try {
        await decryptVault(vault, password);
        return true;
      } catch {
        return false;
      }
    },

    async changePassword(oldPw, newPw) {
      const vault = readVault();
      if (!vault) throw new Error('No wallet found');
      const { payload } = await decryptVault<VaultPayload>(vault, oldPw); // throws on wrong password
      const { vault: next, vk } = await encryptVault(payload, newPw); // fresh salt + IV
      localStorage.setItem(VAULT_KEY, JSON.stringify(next));
      setSession(vk, payload);
    },

    resetAll() {
      clearSession();
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(THROTTLE_KEY);
      set({ accounts: [], keyrings: [], activeAccountId: null, status: 'empty' });
    },

    async addKeyring(secret, accountName) {
      const s = getSession();
      const { keyring, firstPublicKey } = materialise(secret);
      if (get().accounts.some((a) => a.publicKey === firstPublicKey)) throw new Error('This wallet is already in Nocta');
      if (keyring.type === 'mnemonic' && s.payload.keyrings.some((k) => k.type === 'mnemonic' && k.mnemonic === keyring.mnemonic))
        throw new Error('This recovery phrase is already in Nocta');
      s.payload.keyrings.push(keyring);
      await persistSession();
      const count = get().keyrings.filter((k) => k.type === keyring.type).length + 1;
      const krMeta: KeyringMeta = {
        id: keyring.id,
        type: keyring.type,
        label: keyring.type === 'mnemonic' ? `Recovery phrase ${count}` : `Imported key ${count}`,
        backedUp: secret.type === 'mnemonic' ? secret.backedUp : true,
        nextIndex: keyring.type === 'mnemonic' ? 1 : 0,
        createdAt: Date.now(),
      };
      const acct = newAccountMeta(keyring.id, firstPublicKey, keyring.type === 'mnemonic' ? 0 : undefined, accountName);
      commitMeta({ keyrings: [...get().keyrings, krMeta], accounts: [...get().accounts, acct], activeAccountId: acct.id });
      return acct;
    },

    async deriveNextAccount(keyringId, name) {
      const kr = getSession().payload.keyrings.find((k) => k.id === keyringId);
      const meta = get().keyrings.find((k) => k.id === keyringId);
      if (!kr || !meta || kr.type !== 'mnemonic') throw new Error('Accounts can only be derived from a recovery phrase');
      let index = meta.nextIndex;
      const existing = new Set(get().accounts.map((a) => a.publicKey));
      let pk = keypairFromMnemonic(kr.mnemonic, index).publicKey.toBase58();
      while (existing.has(pk)) pk = keypairFromMnemonic(kr.mnemonic, ++index).publicKey.toBase58();
      const acct = newAccountMeta(keyringId, pk, index, name);
      commitMeta({
        accounts: [...get().accounts, acct],
        keyrings: get().keyrings.map((k) => (k.id === keyringId ? { ...k, nextIndex: index + 1 } : k)),
        activeAccountId: acct.id,
      });
      return acct;
    },

    async discoverAccounts(keyringId, hasActivity, maxGap = 5) {
      // Standard gap-limit discovery: derive successive indexes, add those with on-chain activity.
      const kr = getSession().payload.keyrings.find((k) => k.id === keyringId);
      if (!kr || kr.type !== 'mnemonic') return 0;
      let added = 0;
      let gap = 0;
      for (let i = 1; gap < maxGap && i < 50; i++) {
        const pk = keypairFromMnemonic(kr.mnemonic, i).publicKey.toBase58();
        let active = false;
        try {
          active = await hasActivity(pk);
        } catch {
          break; // RPC trouble: stop quietly, user can add accounts manually
        }
        if (!active) {
          gap++;
          continue;
        }
        gap = 0;
        if (get().accounts.some((a) => a.publicKey === pk)) continue;
        const acct = newAccountMeta(keyringId, pk, i);
        commitMeta({
          accounts: [...get().accounts, acct],
          keyrings: get().keyrings.map((k) => (k.id === keyringId ? { ...k, nextIndex: Math.max(k.nextIndex, i + 1) } : k)),
        });
        added++;
      }
      return added;
    },

    /**
     * Scan the known Solana derivation schemes (Phantom-style, Trust/Ledger-style, legacy root)
     * for accounts that hold funds / have on-chain activity, and add any found. This makes a
     * phrase from Exodus, Ledger, Trust, etc. restore the account that actually has the money,
     * instead of a different, empty address. The first funded account becomes active.
     */
    async discoverSolanaSchemes(keyringId, hasActivity) {
      const kr = getSession().payload.keyrings.find((k) => k.id === keyringId);
      if (!kr || kr.type !== 'mnemonic') return 0;
      let added = 0;
      let firstFound: Account | null = null;
      for (const scheme of SOL_SCHEMES) {
        const maxIndex = scheme.indexable ? 10 : 1;
        let gap = 0;
        for (let i = 0; i < maxIndex && gap < 3; i++) {
          let pk: string;
          try {
            pk = keypairFromMnemonic(kr.mnemonic, i, scheme.id).publicKey.toBase58();
          } catch {
            break;
          }
          let active = false;
          try {
            active = await hasActivity(pk);
          } catch {
            break; // RPC trouble: stop quietly
          }
          if (!active) {
            gap++;
            continue;
          }
          gap = 0;
          if (get().accounts.some((a) => a.publicKey === pk)) continue; // already have it
          const label = scheme.id === DEFAULT_SOL_SCHEME ? undefined : `${scheme.hint.split(',')[0]} path`;
          const acct = newAccountMeta(keyringId, pk, i, label, scheme.id === DEFAULT_SOL_SCHEME ? undefined : scheme.id);
          commitMeta({ accounts: [...get().accounts, acct] });
          firstFound ??= acct;
          added++;
        }
      }
      // If the default (created) account is empty but a funded one was found, make it active.
      if (firstFound) {
        const active = get().accounts.find((a) => a.id === get().activeAccountId);
        try {
          if (active && !(await hasActivity(active.publicKey))) commitMeta({ activeAccountId: firstFound.id });
        } catch {
          /* leave active as-is */
        }
      }
      return added;
    },

    renameAccount(id, name) {
      const clean = name.trim().slice(0, 32);
      if (!clean) return;
      commitMeta({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, name: clean } : a)) });
    },

    async removeAccount(id) {
      const { accounts, keyrings, activeAccountId } = get();
      if (accounts.length <= 1) throw new Error('You cannot remove your only account');
      const acct = accounts.find((a) => a.id === id);
      if (!acct) return;
      const remaining = accounts.filter((a) => a.id !== id);
      let nextKeyrings = keyrings;
      if (!remaining.some((a) => a.keyringId === acct.keyringId)) {
        // Last account of this keyring: delete its secret from the vault too.
        const s = getSession();
        s.payload.keyrings = s.payload.keyrings.filter((k) => k.id !== acct.keyringId);
        await persistSession();
        nextKeyrings = keyrings.filter((k) => k.id !== acct.keyringId);
      }
      commitMeta({
        accounts: remaining,
        keyrings: nextKeyrings,
        activeAccountId: activeAccountId === id ? remaining[0].id : activeAccountId,
      });
    },

    setActiveAccount(id) {
      if (get().accounts.some((a) => a.id === id)) commitMeta({ activeAccountId: id });
    },

    markBackedUp(keyringId) {
      commitMeta({ keyrings: get().keyrings.map((k) => (k.id === keyringId ? { ...k, backedUp: true } : k)) });
    },

    async revealSecret(password, keyringId) {
      const vault = readVault();
      if (!vault) throw new Error('No wallet found');
      const { payload } = await decryptVault<VaultPayload>(vault, password); // re-auth every time
      const kr = payload.keyrings.find((k) => k.id === keyringId);
      if (!kr) throw new Error('Not found');
      return kr;
    },

    async revealPrivateKey(password, accountId) {
      if (!(await get().verifyPassword(password))) throw new InvalidPasswordError();
      const acct = get().accounts.find((a) => a.id === accountId);
      if (!acct) throw new Error('Account not found');
      const kp = keypairFor(acct);
      const out = encodeSecretKey(kp);
      kp.secretKey.fill(0);
      return out;
    },

    getKeypair(accountId) {
      if (!hasSession()) throw new Error('Wallet is locked');
      const acct = get().accounts.find((a) => a.id === accountId);
      if (!acct) throw new Error('Account not found');
      return keypairFor(acct);
    },

    /**
     * Derive an external-chain receive address (BTC, ETH, LTC, DOGE, …) from the active account's
     * keyring. Only for recovery-phrase keyrings (imported Solana keys have no seed), and only
     * while unlocked. Derivation happens in-memory; the mnemonic never leaves this call.
     */
    getExternalAddress(accountId, chainId, variant) {
      if (!hasSession()) throw new Error('Wallet is locked');
      const acct = get().accounts.find((a) => a.id === accountId);
      if (!acct) return null;
      const kr = getSession().payload.keyrings.find((k) => k.id === acct.keyringId);
      if (!kr || kr.type !== 'mnemonic') return null;
      const chain = getExternalChain(chainId);
      if (!chain) return null;
      return chain.deriveAddress(kr.mnemonic, variant);
    },

    getLitecoinAddress(accountId, type = 'segwit') {
      return get().getExternalAddress(accountId, 'litecoin', type);
    },

    /** The recovery phrase + account index for signing external-chain transactions (unlocked only). */
    getMnemonicForAccount(accountId) {
      if (!hasSession()) throw new Error('Wallet is locked');
      const acct = get().accounts.find((a) => a.id === accountId);
      if (!acct) return null;
      const kr = getSession().payload.keyrings.find((k) => k.id === acct.keyringId);
      if (!kr || kr.type !== 'mnemonic') return null;
      return { mnemonic: kr.mnemonic, index: acct.index ?? 0 };
    },
  };
});

export function useActiveAccount(): Account | undefined {
  return useWallet((s) => s.accounts.find((a) => a.id === s.activeAccountId) ?? s.accounts[0]);
}
