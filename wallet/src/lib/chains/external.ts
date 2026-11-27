/**
 * External receive chains — every non-Solana coin Nocta can receive today. Each derives a
 * standard, portable address from the user's recovery phrase, so any wallet can send to it.
 * Receive-only for now: Nocta does not sign transactions on these chains yet (so no funds can
 * be moved by mistake). Solana remains the full send/receive/swap chain.
 */
import { deriveEvmAddress, type EvmChainParams, EVM_CHAINS, evmExplorerAddressUrl, evmExplorerTxUrl, isValidEvmAddress } from '../crypto/evm';
import { deriveUtxoAddress, defaultAddressType, isValidUtxoAddress, type UtxoAddressType, type UtxoChainParams, UTXO_CHAINS, utxoExplorerAddressUrl, utxoExplorerTxUrl } from '../crypto/utxo';

export type ExternalKind = 'utxo' | 'evm';

export interface ExternalChain {
  id: string;
  name: string;
  symbol: string;
  kind: ExternalKind;
  decimals: number;
  coingeckoId: string;
  /** How a QR/URI payment request is scheme-prefixed. */
  uriScheme: string;
  /** SegWit/legacy variants for UTXO chains that support both. */
  variants?: { id: UtxoAddressType; label: string }[];
  deriveAddress(mnemonic: string, variant?: string, index?: number): string;
  isValidAddress(addr: string): boolean;
  explorerAddress(addr: string): string;
  explorerTx(tx: string): string;
}

function utxoChain(coin: UtxoChainParams): ExternalChain {
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    kind: 'utxo',
    decimals: 8,
    coingeckoId: coin.coingeckoId,
    uriScheme: coin.id,
    // One canonical address per coin (no picker). The coin's defaultType decides the format:
    // BTC → SegWit (bc1…), LTC → legacy (L…, matches Exodus), DOGE → legacy (D…).
    variants: undefined,
    deriveAddress: (m, variant, index) => deriveUtxoAddress(m, coin, { type: (variant as UtxoAddressType) ?? defaultAddressType(coin), index }),
    isValidAddress: (a) => isValidUtxoAddress(coin, a),
    explorerAddress: (a) => utxoExplorerAddressUrl(coin, a),
    explorerTx: (t) => utxoExplorerTxUrl(coin, t),
  };
}

function evmChain(chain: EvmChainParams): ExternalChain {
  return {
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    kind: 'evm',
    decimals: 18,
    coingeckoId: chain.coingeckoId,
    uriScheme: 'ethereum',
    deriveAddress: (m, _variant, index) => deriveEvmAddress(m, index),
    isValidAddress: isValidEvmAddress,
    explorerAddress: (a) => evmExplorerAddressUrl(chain, a),
    explorerTx: (t) => evmExplorerTxUrl(chain, t),
  };
}

export const EXTERNAL_CHAINS: ExternalChain[] = [
  utxoChain(UTXO_CHAINS.bitcoin),
  evmChain(EVM_CHAINS.ethereum),
  utxoChain(UTXO_CHAINS.litecoin),
  utxoChain(UTXO_CHAINS.dogecoin),
  evmChain(EVM_CHAINS.base),
  evmChain(EVM_CHAINS.polygon),
  evmChain(EVM_CHAINS.arbitrum),
];

export function getExternalChain(id: string): ExternalChain | undefined {
  return EXTERNAL_CHAINS.find((c) => c.id === id);
}
