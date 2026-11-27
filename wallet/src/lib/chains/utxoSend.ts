/**
 * UTXO sending (Bitcoin, Litecoin, Dogecoin) on the audited @scure/btc-signer. The library does
 * all transaction construction, coin selection (selectUTXO), change and signing — we never
 * hand-roll crypto. We send from the chain's DEFAULT address type (SegWit for BTC/LTC, legacy for
 * DOGE), i.e. the address shown on Receive.
 *
 * Because a real mainnet broadcast cannot be exercised in CI, the UI requires an extra
 * confirmation and recommends sending a small amount first. The transaction structure (inputs,
 * recipient output, change back to the sender, fee) is verified offline in tests.
 */
import { Transaction, p2pkh, p2wpkh, selectUTXO, NETWORK } from '@scure/btc-signer';
type BTC_NETWORK = typeof NETWORK;
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { hex } from '@scure/base';
import { normalizeMnemonic } from '../crypto/keys';
import { defaultAddressType, type UtxoChainParams } from '../crypto/utxo';

export const UTXO_NETWORKS: Record<string, BTC_NETWORK> = {
  bitcoin: NETWORK,
  litecoin: { bech32: 'ltc', pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 },
  dogecoin: { bech32: 'doge', pubKeyHash: 0x1e, scriptHash: 0x16, wif: 0x9e },
};

export interface Utxo {
  txid: string;
  vout: number;
  value: bigint;
  scriptHex: string;
}

export interface UtxoSigner {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  type: 'segwit' | 'legacy';
  network: BTC_NETWORK;
}

export function deriveUtxoSigner(mnemonic: string, coin: UtxoChainParams, index = 0): UtxoSigner {
  const type = defaultAddressType(coin);
  const network = UTXO_NETWORKS[coin.id];
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const path = `m/${type === 'segwit' ? 84 : 44}'/${coin.coinType}'/0'/0/${index}`;
  const node = HDKey.fromMasterSeed(seed).derive(path);
  seed.fill(0);
  if (!node.privateKey || !node.publicKey) throw new Error('Derivation failed');
  const pay = type === 'segwit' ? p2wpkh(node.publicKey, network) : p2pkh(node.publicKey, network);
  return { privateKey: node.privateKey, publicKey: node.publicKey, address: pay.address!, type, network };
}

export interface UtxoSendPlan {
  tx: Transaction;
  fee: bigint;
  amount: bigint;
  change: bigint;
  inputs: number;
  hex: string;
}

/**
 * Build and SIGN a transaction spending `utxos` to `to` for `amount` base units, change back to
 * `signer.address`, at `feePerByte` sat/vByte. Returns the finalized tx + hex. Not broadcast.
 */
export function buildUtxoTx(params: {
  signer: UtxoSigner;
  utxos: Utxo[];
  to: string;
  amount: bigint;
  feePerByte: bigint;
  prevTxHex?: Record<string, string>; // txid -> raw hex, required for legacy (non-witness) inputs
}): UtxoSendPlan {
  const { signer, utxos, to, amount, feePerByte, prevTxHex } = params;
  const pay = signer.type === 'segwit' ? p2wpkh(signer.publicKey, signer.network) : p2pkh(signer.publicKey, signer.network);

  const inputs = utxos.map((u) => {
    const base = { txid: hex.decode(u.txid), index: u.vout };
    if (signer.type === 'segwit') {
      return { ...base, witnessUtxo: { script: pay.script, amount: u.value } };
    }
    const raw = prevTxHex?.[u.txid];
    if (!raw) throw new Error(`Missing previous transaction for legacy input ${u.txid}`);
    return { ...base, nonWitnessUtxo: hex.decode(raw) };
  });

  const selected = selectUTXO(inputs, [{ address: to, amount }], 'default', {
    feePerByte,
    changeAddress: signer.address,
    network: signer.network,
    bip69: true,
    createTx: true,
    allowUnknownOutputs: false,
  });
  if (!selected || !selected.tx) throw new Error('Insufficient funds to cover the amount and network fee.');

  const tx = selected.tx;
  tx.sign(signer.privateKey);
  tx.finalize();

  // Outputs are BIP-69 sorted, so identify by total: change = (all outputs) - recipient amount.
  let totalOut = 0n;
  for (let i = 0; i < tx.outputsLength; i++) totalOut += tx.getOutput(i)?.amount ?? 0n;
  const change = totalOut - amount;
  return { tx, fee: selected.fee ?? 0n, amount, change, inputs: utxos.length, hex: hex.encode(tx.extract()) };
}
