/**
 * Chain registry. Nocta is built chain-agnostic at the edges: every chain provides an
 * adapter with address validation, explorer links and derivation metadata. Solana is
 * the only enabled chain today; others are listed so the UI can warn users clearly.
 *
 * To add a chain: implement ChainAdapter, add a derivation path in lib/crypto/keys.ts,
 * provide balance/history/transfer modules like lib/solana/*, and flip `enabled`.
 */
import { checkAddress } from '../solana/address';
import { explorerAddressUrl, explorerTxUrl, NETWORK_LIST, type SolanaNetwork } from '../solana/networks';

export interface ChainAdapter {
  id: string;
  name: string;
  nativeSymbol: string;
  enabled: boolean;
  derivationPath?: string;
  networks: { id: string; label: string; isTestnet: boolean }[];
  isValidAddress(address: string): boolean;
  explorerTx?(network: string, signature: string): string;
  explorerAddress?(network: string, address: string): string;
}

export const solanaChain: ChainAdapter = {
  id: 'solana',
  name: 'Solana',
  nativeSymbol: 'SOL',
  enabled: true,
  derivationPath: "m/44'/501'/n'/0'",
  networks: NETWORK_LIST.map((n) => ({ id: n.id, label: n.label, isTestnet: n.isTestnet })),
  isValidAddress: (a) => checkAddress(a).valid,
  explorerTx: (n, s) => explorerTxUrl(n as SolanaNetwork, s),
  explorerAddress: (n, a) => explorerAddressUrl(n as SolanaNetwork, a),
};

const notYet = (id: string, name: string, sym: string): ChainAdapter => ({
  id,
  name,
  nativeSymbol: sym,
  enabled: false,
  networks: [],
  isValidAddress: () => false,
});

export const CHAINS: ChainAdapter[] = [
  solanaChain,
  notYet('ethereum', 'Ethereum', 'ETH'),
  notYet('bitcoin', 'Bitcoin', 'BTC'),
  notYet('base', 'Base', 'ETH'),
  notYet('polygon', 'Polygon', 'POL'),
];
