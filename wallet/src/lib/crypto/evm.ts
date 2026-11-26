/**
 * EVM (Ethereum & compatible) receive-address derivation.
 *
 * Standard BIP-44 path m/44'/60'/0'/0/i, secp256k1 via @scure/bip32 + @noble/curves, address =
 * last 20 bytes of keccak256(uncompressed pubkey), EIP-55 checksummed. Verified against the
 * canonical test vector (abandon…about → 0x9858EfFD232B4033E47d90003D41EC34EcaEda94).
 *
 * The same address is valid on every EVM chain (Ethereum, Base, Polygon, Arbitrum, …).
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { normalizeMnemonic } from './keys';

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Apply the EIP-55 mixed-case checksum to a lowercase (no 0x) hex address. */
export function toChecksumAddress(hexNoPrefix: string): string {
  const lower = hexNoPrefix.toLowerCase();
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += nibble >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function deriveEvmAddress(mnemonic: string, index = 0): string {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Invalid address index');
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.publicKey) throw new Error('Derivation failed');
  const uncompressed = secp256k1.ProjectivePoint.fromHex(node.publicKey).toRawBytes(false).slice(1); // drop 0x04 prefix → 64 bytes
  seed.fill(0);
  const addr = keccak_256(uncompressed).slice(-20);
  return toChecksumAddress(toHex(addr));
}

export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

export interface EvmChainParams {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  rpc: string;
  coingeckoId: string;
  explorer: string; // base URL, e.g. https://etherscan.io
}

export const ETHEREUM: EvmChainParams = {
  id: 'ethereum', name: 'Ethereum', symbol: 'ETH', chainId: 1,
  rpc: 'https://ethereum-rpc.publicnode.com', coingeckoId: 'ethereum', explorer: 'https://etherscan.io',
};
export const BASE: EvmChainParams = {
  id: 'base', name: 'Base', symbol: 'ETH', chainId: 8453,
  rpc: 'https://base-rpc.publicnode.com', coingeckoId: 'ethereum', explorer: 'https://basescan.org',
};
export const POLYGON: EvmChainParams = {
  id: 'polygon', name: 'Polygon', symbol: 'POL', chainId: 137,
  rpc: 'https://polygon-bor-rpc.publicnode.com', coingeckoId: 'matic-network', explorer: 'https://polygonscan.com',
};
export const ARBITRUM: EvmChainParams = {
  id: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', chainId: 42161,
  rpc: 'https://arbitrum-one-rpc.publicnode.com', coingeckoId: 'ethereum', explorer: 'https://arbiscan.io',
};

export const EVM_CHAINS: Record<string, EvmChainParams> = { ethereum: ETHEREUM, base: BASE, polygon: POLYGON, arbitrum: ARBITRUM };

export function evmExplorerAddressUrl(chain: EvmChainParams, addr: string): string {
  return `${chain.explorer}/address/${addr}`;
}
export function evmExplorerTxUrl(chain: EvmChainParams, tx: string): string {
  return `${chain.explorer}/tx/${tx}`;
}
