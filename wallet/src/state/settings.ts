import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SolanaNetwork } from '@/lib/solana/networks';
import type { Currency } from '@/lib/api/coingecko';

export const ACCENTS = {
  aurora: { label: 'Aurora', from: '#3cf0c0', to: '#4f7cff' },
  crimson: { label: 'Crimson', from: '#ff4d6d', to: '#b5179e' },
  solar: { label: 'Solar', from: '#ffb547', to: '#ff5e3a' },
  iris: { label: 'Iris', from: '#a78bfa', to: '#6366f1' },
  glacier: { label: 'Glacier', from: '#7dd3fc', to: '#e0f2fe' },
} as const;
export type AccentId = keyof typeof ACCENTS;

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60, 240] as const;

export interface Settings {
  network: SolanaNetwork;
  rpc: Partial<Record<SolanaNetwork, string>>;
  currency: Currency;
  autoLockMinutes: number;
  accent: AccentId;
  surface: 'dark' | 'oled';
  reduceMotion: boolean;
  hideBalances: boolean;
  hideZeroBalances: boolean;
  hideUnverified: boolean;
  requirePasswordToSign: boolean;
  fetchMarketData: boolean;
  testnetReferenceValues: boolean;
  mainnetAcknowledged: boolean;
  slippageBps: number;
  feeLevel: 'eco' | 'normal' | 'turbo';
  clipboardClearSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  network: 'mainnet-beta', // real-world values by default
  rpc: {},
  currency: 'usd',
  autoLockMinutes: 15,
  accent: 'aurora',
  surface: 'dark',
  reduceMotion: false,
  hideBalances: false,
  hideZeroBalances: false,
  hideUnverified: false,
  requirePasswordToSign: false,
  fetchMarketData: true,
  testnetReferenceValues: true,
  mainnetAcknowledged: true,
  slippageBps: 50,
  feeLevel: 'eco', // cheapest priority fee by default
  clipboardClearSeconds: 60,
};

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'nocta:settings:v1',
      version: 1,
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted as Partial<Settings>) }),
    },
  ),
);

/** Defensive: never trust persisted values blindly. */
function sanitize(p: Partial<Settings> | undefined): Partial<Settings> {
  if (!p || typeof p !== 'object') return {};
  const out: Partial<Settings> = { ...p };
  if (!['mainnet-beta', 'devnet', 'testnet'].includes(out.network as string)) delete out.network;
  if (out.accent && !(out.accent in ACCENTS)) delete out.accent;
  if (typeof out.autoLockMinutes !== 'number' || out.autoLockMinutes < 1 || out.autoLockMinutes > 240) delete out.autoLockMinutes;
  if (typeof out.slippageBps !== 'number' || out.slippageBps < 1 || out.slippageBps > 5000) delete out.slippageBps;
  if (!['eco', 'normal', 'turbo'].includes(out.feeLevel as string)) delete out.feeLevel;
  return out;
}

export function rpcUrlFor(s: Pick<Settings, 'rpc'>, network: SolanaNetwork, fallback: string): string {
  return s.rpc[network]?.trim() || fallback;
}
