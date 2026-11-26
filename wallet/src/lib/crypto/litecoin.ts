/**
 * Backward-compatible Litecoin helpers. The implementation now lives in ./utxo.ts, which
 * generalises the same BIP-84/44 derivation to Bitcoin, Litecoin and Dogecoin.
 */
import {
  BITCOIN as UTXO_BITCOIN,
  LITECOIN as UTXO_LITECOIN,
  deriveUtxoAddress,
  isValidUtxoAddress,
  type UtxoAddressType,
  type UtxoChainParams,
  utxoExplorerAddressUrl,
  utxoExplorerTxUrl,
} from './utxo';

export type LtcAddressType = UtxoAddressType;
export const BITCOIN = UTXO_BITCOIN;
export const LITECOIN = UTXO_LITECOIN;

/** Kept for the derivation-vector tests: derive for an explicit coin. */
export function deriveAddress(mnemonic: string, opts: { type?: UtxoAddressType; index?: number; coin?: UtxoChainParams } = {}): string {
  return deriveUtxoAddress(mnemonic, opts.coin ?? LITECOIN, { type: opts.type, index: opts.index });
}

export function deriveLitecoinAddress(mnemonic: string, type: LtcAddressType = 'segwit', index = 0): string {
  return deriveUtxoAddress(mnemonic, LITECOIN, { type, index });
}

export function isValidLitecoinAddress(addr: string): boolean {
  return isValidUtxoAddress(LITECOIN, addr);
}

export function ltcExplorerAddressUrl(addr: string): string {
  return utxoExplorerAddressUrl(LITECOIN, addr);
}
export function ltcExplorerTxUrl(txid: string): string {
  return utxoExplorerTxUrl(LITECOIN, txid);
}
