import { describe, expect, it } from 'vitest';
import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { BITCOIN, LITECOIN } from '../crypto/utxo';
import { buildUtxoTx, deriveUtxoSigner, UTXO_NETWORKS } from './utxoSend';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('UTXO sending (construction + signing)', () => {
  it('derives the correct sender address per chain', () => {
    expect(deriveUtxoSigner(M, BITCOIN).address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(deriveUtxoSigner(M, LITECOIN).address).toBe('ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh');
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

  it('uses the right network params for Litecoin', () => {
    expect(UTXO_NETWORKS.litecoin.bech32).toBe('ltc');
    expect(UTXO_NETWORKS.litecoin.wif).toBe(0xb0);
    const signer = deriveUtxoSigner(M, LITECOIN);
    const recipient = deriveUtxoSigner(M, LITECOIN, 1).address; // a real, valid LTC address
    const plan = buildUtxoTx({ signer, utxos: [{ txid: 'd'.repeat(64), vout: 0, value: 5_000_000n, scriptHex: '' }], to: recipient, amount: 1_000_000n, feePerByte: 2n });
    expect(plan.amount).toBe(1_000_000n);
    expect(plan.change).toBeGreaterThan(0n);
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
