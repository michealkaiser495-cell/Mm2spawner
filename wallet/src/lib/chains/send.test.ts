import { describe, expect, it } from 'vitest';
import { Transaction, p2pkh } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { BITCOIN, LITECOIN } from '../crypto/utxo';
import { buildUtxoTx, deriveUtxoSigner, UTXO_NETWORKS } from './utxoSend';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('UTXO sending (construction + signing)', () => {
  it('derives the correct sender address per chain', () => {
    expect(deriveUtxoSigner(M, BITCOIN).address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    // Litecoin now uses the legacy (L…) address to match Exodus's default derivation.
    expect(deriveUtxoSigner(M, LITECOIN).address).toBe('LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez');
    expect(deriveUtxoSigner(M, LITECOIN).type).toBe('legacy');
  });

  it('builds a valid signed tx: recipient gets the exact amount, change returns, fee charged', () => {
    const signer = deriveUtxoSigner(M, BITCOIN);
    // Distinct recipient (Bitcoin genesis-style address is not segwit; use a known segwit addr).
    const to = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const utxos = [
      { txid: 'a'.repeat(64), vout: 0, value: 1_000_000n, scriptHex: '' },
      { txid: 'b'.repeat(64), vout: 1, value: 1_000_000n, scriptHex: '' },
    ];
    const plan = buildUtxoTx({ signer, utxos, to, amount: 1_500_000n, feePerByte: 5n });

    // Re-parse the finalized raw tx to confirm what will actually be broadcast.
    const parsed = Transaction.fromRaw(hex.decode(plan.hex), { allowUnknownOutputs: true });
    let total = 0n;
    let toRecipient = 0n;
    let toChange = 0n;
    for (let i = 0; i < parsed.outputsLength; i++) {
      const o = parsed.getOutput(i)!;
      total += o.amount!;
      const addr = addressOf(o.script!, UTXO_NETWORKS.bitcoin);
      if (addr === to) toRecipient += o.amount!;
      if (addr === signer.address) toChange += o.amount!;
    }
    expect(toRecipient).toBe(1_500_000n); // recipient receives exactly the requested amount
    expect(toChange).toBeGreaterThan(0n); // change returns to the sender
    expect(plan.fee).toBeGreaterThan(0n);
    // Conservation: inputs = outputs + fee.
    expect(2_000_000n).toBe(total + plan.fee);
    expect(parsed.isFinal).toBe(true);
  });

  it('refuses to spend more than the inputs can cover', () => {
    const signer = deriveUtxoSigner(M, BITCOIN);
    const utxos = [{ txid: 'c'.repeat(64), vout: 0, value: 100_000n, scriptHex: '' }];
    expect(() => buildUtxoTx({ signer, utxos, to: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: 500_000n, feePerByte: 5n })).toThrow(/Insufficient/);
  });

  it('uses the right network params + legacy address for Litecoin', () => {
    expect(UTXO_NETWORKS.litecoin.bech32).toBe('ltc');
    expect(UTXO_NETWORKS.litecoin.wif).toBe(0xb0);
    const signer = deriveUtxoSigner(M, LITECOIN);
    // LTC now uses the Exodus-style legacy address (starts with L), not ltc1….
    expect(signer.type).toBe('legacy');
    expect(signer.address.startsWith('L')).toBe(true);
    const recipient = deriveUtxoSigner(M, LITECOIN, 1).address;
    expect(recipient.startsWith('L')).toBe(true);
  });

  it('builds and signs a real legacy Litecoin tx from its previous-tx hex', () => {
    const signer = deriveUtxoSigner(M, LITECOIN);
    const recipient = deriveUtxoSigner(M, LITECOIN, 1).address;
    // Construct a real previous transaction whose output[0] pays the signer (legacy inputs are
    // spent by their full previous tx, which production fetches via fetchPrevTxHex).
    const pay = p2pkh(signer.publicKey, signer.network);
    const prev = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
    prev.addOutput({ script: pay.script, amount: 5_000_000n });
    prev.addInput({ txid: hex.decode('e'.repeat(64)), index: 0, finalScriptSig: hex.decode('00') });
    const prevHex = hex.encode(prev.toBytes(true, false));
    const prevTxid = prev.id;

    const plan = buildUtxoTx({
      signer,
      utxos: [{ txid: prevTxid, vout: 0, value: 5_000_000n, scriptHex: '' }],
      to: recipient,
      amount: 1_000_000n,
      feePerByte: 2n,
      prevTxHex: { [prevTxid]: prevHex },
    });
    expect(plan.amount).toBe(1_000_000n);
    expect(plan.change).toBeGreaterThan(0n);
    expect(plan.fee).toBeGreaterThan(0n);
    // Re-parse the broadcastable tx: one output is exactly the recipient amount, and
    // inputs (5,000,000) = outputs + fee (value conservation).
    const parsed = Transaction.fromRaw(hex.decode(plan.hex), { allowUnknownOutputs: true });
    let total = 0n;
    const amounts: bigint[] = [];
    for (let i = 0; i < parsed.outputsLength; i++) {
      const o = parsed.getOutput(i)!;
      total += o.amount!;
      amounts.push(o.amount!);
    }
    expect(amounts).toContain(1_000_000n);
    expect(total + plan.fee).toBe(5_000_000n);
  });

  it('requires the previous-tx hex for a legacy input', () => {
    const signer = deriveUtxoSigner(M, LITECOIN);
    expect(() =>
      buildUtxoTx({ signer, utxos: [{ txid: 'd'.repeat(64), vout: 0, value: 5_000_000n, scriptHex: '' }], to: deriveUtxoSigner(M, LITECOIN, 1).address, amount: 1_000_000n, feePerByte: 2n }),
    ).toThrow(/previous transaction/i);
  });
});

// Minimal script→address decoder for the test (p2wpkh v0).
function addressOf(script: Uint8Array, network: { bech32: string }): string | undefined {
  // OP_0 <20-byte program>  => 0x00 0x14 <20 bytes>
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
    // Reuse btc-signer's encoder via Transaction isn't exposed here; derive bech32 directly.
    return bech32Encode(network.bech32, script.slice(2));
  }
  return undefined;
}

import { bech32 } from '@scure/base';
function bech32Encode(hrp: string, program: Uint8Array): string {
  return bech32.encode(hrp, [0, ...bech32.toWords(program)]);
}
