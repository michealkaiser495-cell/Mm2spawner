import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { DEFAULT_SOL_SCHEME, keypairFromMnemonic, publicKeyFromMnemonic, SOL_SCHEMES, solanaPathFor } from './keys';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Solana derivation schemes', () => {
  it('builds hardened paths for each scheme', () => {
    expect(solanaPathFor('bip44-0-0', 0)).toBe("m/44'/501'/0'/0'");
    expect(solanaPathFor('bip44-0', 0)).toBe("m/44'/501'/0'");
    expect(solanaPathFor('bip44-root', 0)).toBe("m/44'/501'");
    expect(solanaPathFor('bip44-0-0', 3)).toBe("m/44'/501'/3'/0'");
  });

  it('derives a distinct, valid address per scheme from the same phrase', () => {
    const addrs = SOL_SCHEMES.map((s) => publicKeyFromMnemonic(M, 0, s.id));
    for (const a of addrs) expect(() => new PublicKey(a)).not.toThrow();
    expect(new Set(addrs).size).toBe(SOL_SCHEMES.length); // all different
  });

  it('default scheme matches the no-scheme derivation (back-compat)', () => {
    expect(DEFAULT_SOL_SCHEME).toBe('bip44-0-0');
    expect(keypairFromMnemonic(M, 0).publicKey.toBase58()).toBe(publicKeyFromMnemonic(M, 0, 'bip44-0-0'));
  });
});
