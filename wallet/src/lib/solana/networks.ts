import { Connection } from '@solana/web3.js';

export type SolanaNetwork = 'mainnet-beta' | 'devnet' | 'testnet';

export interface NetworkConfig {
  id: SolanaNetwork;
  label: string;
  short: string;
  defaultRpc: string;
  isTestnet: boolean;
  /** Mainnet-only third-party services (Jupiter, prices) are only meaningful on mainnet. */
  hasMarketData: boolean;
}

export const NETWORKS: Record<SolanaNetwork, NetworkConfig> = {
  'mainnet-beta': {
    id: 'mainnet-beta',
    label: 'Solana Mainnet',
    short: 'Mainnet',
    defaultRpc: 'https://api.mainnet-beta.solana.com',
    isTestnet: false,
    hasMarketData: true,
  },
  devnet: {
    id: 'devnet',
    label: 'Solana Devnet',
    short: 'Devnet',
    defaultRpc: 'https://api.devnet.solana.com',
    isTestnet: true,
    hasMarketData: false,
  },
  testnet: {
    id: 'testnet',
    label: 'Solana Testnet',
    short: 'Testnet',
    defaultRpc: 'https://api.testnet.solana.com',
    isTestnet: true,
    hasMarketData: false,
  },
};

export const NETWORK_LIST = Object.values(NETWORKS);

export function explorerTxUrl(network: SolanaNetwork, signature: string): string {
  const q = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${q}`;
}

export function explorerAddressUrl(network: SolanaNetwork, address: string): string {
  const q = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}${q}`;
}

export function isValidRpcUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch {
    return false;
  }
}

const cache = new Map<string, Connection>();

export function getConnection(rpcUrl: string): Connection {
  let c = cache.get(rpcUrl);
  if (!c) {
    c = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });
    cache.set(rpcUrl, c);
  }
  return c;
}
