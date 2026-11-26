import { describe, expect, it } from 'vitest';
import { BITCOIN, DOGECOIN, LITECOIN, deriveUtxoAddress, isValidUtxoAddress } from './utxo';
import { deriveEvmAddress, isValidEvmAddress, toChecksumAddress } from './evm';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('UTXO derivation (BTC / LTC / DOGE)', () => {
  it('matches canonical Bitcoin BIP-84 and BIP-44 vectors', () => {
    expect(deriveUtxoAddress(M, BITCOIN, { type: 'segwit' })).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(deriveUtxoAddress(M, BITCOIN, { type: 'legacy' })).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
  });

  it('derives the known Litecoin addresses', () => {
    expect(deriveUtxoAddress(M, LITECOIN, { type: 'segwit' })).toBe('ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh');
    expect(deriveUtxoAddress(M, LITECOIN, { type: 'legacy' })).toBe('LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez');
  });

  it('derives a legacy Dogecoin address (D-prefixed) and falls back from segwit', () => {
    const legacy = deriveUtxoAddress(M, DOGECOIN, { type: 'legacy' });
    expect(legacy).toMatch(/^D[1-9A-HJ-NP-Za-km-z]{25,39}$/);
    // Dogecoin has no SegWit, so a 'segwit' request yields the same legacy address.
    expect(deriveUtxoAddress(M, DOGECOIN, { type: 'segwit' })).toBe(legacy);
  });

  it('validates addresses against the right chain and rejects cross-chain', () => {
    const btc = deriveUtxoAddress(M, BITCOIN, { type: 'segwit' });
    const ltc = deriveUtxoAddress(M, LITECOIN, { type: 'segwit' });
    const doge = deriveUtxoAddress(M, DOGECOIN, { type: 'legacy' });
    expect(isValidUtxoAddress(BITCOIN, btc)).toBe(true);
    expect(isValidUtxoAddress(LITECOIN, ltc)).toBe(true);
    expect(isValidUtxoAddress(DOGECOIN, doge)).toBe(true);
    expect(isValidUtxoAddress(LITECOIN, btc)).toBe(false); // bc1 is not ltc1
    expect(isValidUtxoAddress(BITCOIN, ltc)).toBe(false);
    expect(isValidUtxoAddress(BITCOIN, 'garbage')).toBe(false);
  });

  it('is deterministic and index-dependent', () => {
    expect(deriveUtxoAddress(M, BITCOIN, { index: 0 })).toBe(deriveUtxoAddress(M, BITCOIN, { index: 0 }));
    expect(deriveUtxoAddress(M, BITCOIN, { index: 1 })).not.toBe(deriveUtxoAddress(M, BITCOIN, { index: 0 }));
  });
});

describe('EVM derivation (Ethereum & L2s)', () => {
  it('matches the canonical Ethereum test vector with EIP-55 checksum', () => {
    expect(deriveEvmAddress(M, 0)).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('produces valid, checksummed, index-dependent addresses', () => {
    const a0 = deriveEvmAddress(M, 0);
    const a1 = deriveEvmAddress(M, 1);
    expect(isValidEvmAddress(a0)).toBe(true);
    expect(a0).not.toBe(a1);
    // Round-trip the checksum.
    expect(toChecksumAddress(a0.slice(2).toLowerCase())).toBe(a0);
  });

  it('rejects non-EVM strings', () => {
    expect(isValidEvmAddress('0x123')).toBe(false);
    expect(isValidEvmAddress('ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh')).toBe(false);
  });
});
