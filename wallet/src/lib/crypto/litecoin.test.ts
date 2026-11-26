import { describe, expect, it } from 'vitest';
import { BITCOIN, deriveAddress, deriveLitecoinAddress, isValidLitecoinAddress } from './litecoin';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Litecoin / HD address derivation', () => {
  // Canonical BIP-84 (SegWit) and BIP-44 (legacy) Bitcoin vectors prove the derivation pipeline.
  it('matches the canonical BIP-84 Bitcoin SegWit vector', () => {
    expect(deriveAddress(M, { type: 'segwit', coin: BITCOIN, index: 0 })).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });
  it('matches the canonical BIP-44 Bitcoin legacy vector', () => {
    expect(deriveAddress(M, { type: 'legacy', coin: BITCOIN, index: 0 })).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
  });

  it('derives the standard Litecoin SegWit and legacy addresses for the test seed', () => {
    // Verified against BlockCypher (both have real on-chain history for this well-known seed).
    expect(deriveLitecoinAddress(M, 'segwit', 0)).toBe('ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh');
    expect(deriveLitecoinAddress(M, 'legacy', 0)).toBe('LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez');
  });

  it('is deterministic and index-dependent', () => {
    expect(deriveLitecoinAddress(M, 'segwit', 0)).toBe(deriveLitecoinAddress(M, 'segwit', 0));
    expect(deriveLitecoinAddress(M, 'segwit', 1)).not.toBe(deriveLitecoinAddress(M, 'segwit', 0));
  });

  it('produces valid addresses and rejects foreign/invalid ones', () => {
    expect(isValidLitecoinAddress(deriveLitecoinAddress(M, 'segwit', 0))).toBe(true);
    expect(isValidLitecoinAddress(deriveLitecoinAddress(M, 'legacy', 0))).toBe(true);
    expect(isValidLitecoinAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toBe(false); // Bitcoin
    expect(isValidLitecoinAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')).toBe(false); // Solana
    expect(isValidLitecoinAddress('ltc1qinvalid')).toBe(false);
    expect(isValidLitecoinAddress('')).toBe(false);
  });
});
