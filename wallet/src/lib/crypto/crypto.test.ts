import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { createMnemonic, isValidMnemonic, keypairFromMnemonic, normalizeMnemonic, parsePrivateKey, solanaPath } from './keys';
import { decryptVault, encryptVault, InvalidPasswordError, isEncryptedVault } from './vault';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('key derivation', () => {
  it('matches the standard Solana derivation test vector (m/44\'/501\'/0\'/0\')', () => {
    expect(keypairFromMnemonic(TEST_MNEMONIC, 0).publicKey.toBase58()).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  });

  it('derives distinct accounts per index, deterministically', () => {
    const a1 = keypairFromMnemonic(TEST_MNEMONIC, 1).publicKey.toBase58();
    expect(a1).not.toBe(keypairFromMnemonic(TEST_MNEMONIC, 0).publicKey.toBase58());
    expect(keypairFromMnemonic(TEST_MNEMONIC, 1).publicKey.toBase58()).toBe(a1);
  });

  it('builds hardened Solana paths and rejects bad indexes', () => {
    expect(solanaPath(3)).toBe("m/44'/501'/3'/0'");
    expect(() => solanaPath(-1)).toThrow();
    expect(() => solanaPath(1.5)).toThrow();
  });

  it('generates valid 12 and 24 word phrases', () => {
    const m12 = createMnemonic(12);
    const m24 = createMnemonic(24);
    expect(m12.split(' ')).toHaveLength(12);
    expect(m24.split(' ')).toHaveLength(24);
    expect(isValidMnemonic(m12)).toBe(true);
    expect(isValidMnemonic(m24)).toBe(true);
    expect(createMnemonic()).not.toBe(createMnemonic());
  });

  it('normalises pasted phrases and rejects bad checksums', () => {
    expect(isValidMnemonic(`  ${TEST_MNEMONIC.toUpperCase().replace(/ /g, '   ')}\n`)).toBe(true);
    expect(normalizeMnemonic(' A  B ')).toBe('a b');
    expect(isValidMnemonic(TEST_MNEMONIC.replace(/about$/, 'abandon'))).toBe(false);
    expect(isValidMnemonic('abandon abandon')).toBe(false);
  });
});

describe('private key import', () => {
  const kp = Keypair.generate();

  it('accepts base58 and JSON array formats', () => {
    expect(parsePrivateKey(bs58.encode(kp.secretKey)).publicKey.equals(kp.publicKey)).toBe(true);
    expect(parsePrivateKey(JSON.stringify(Array.from(kp.secretKey))).publicKey.equals(kp.publicKey)).toBe(true);
  });

  it('rejects malformed or inconsistent keys', () => {
    expect(() => parsePrivateKey('not-a-key')).toThrow();
    expect(() => parsePrivateKey(bs58.encode(kp.secretKey.slice(0, 32)))).toThrow(/64 bytes/);
    const tampered = Uint8Array.from(kp.secretKey);
    tampered[40] ^= 1; // public half no longer matches
    expect(() => parsePrivateKey(bs58.encode(tampered))).toThrow();
    expect(() => parsePrivateKey('[1,2,300]')).toThrow();
  });

  it('returned keypair survives wiping of the parse buffer', () => {
    const parsed = parsePrivateKey(bs58.encode(kp.secretKey));
    expect(Array.from(parsed.secretKey)).toEqual(Array.from(kp.secretKey));
  });
});

describe('vault encryption', () => {
  it('round-trips and uses fresh salt + IV each time', async () => {
    const payload = { keyrings: [{ id: '1', type: 'mnemonic', mnemonic: TEST_MNEMONIC }] };
    const { vault } = await encryptVault(payload, 'correct horse battery staple');
    const { vault: vault2 } = await encryptVault(payload, 'correct horse battery staple');
    expect(isEncryptedVault(vault)).toBe(true);
    expect(vault.kdf.iterations).toBe(600_000);
    expect(vault.kdf.salt).not.toBe(vault2.kdf.salt);
    expect(vault.cipher.iv).not.toBe(vault2.cipher.iv);
    expect(JSON.stringify(vault)).not.toContain('abandon');
    const { payload: out } = await decryptVault<typeof payload>(vault, 'correct horse battery staple');
    expect(out).toEqual(payload);
  });

  it('rejects wrong passwords and tampered ciphertext', async () => {
    const { vault } = await encryptVault({ a: 1 }, 'pw-one-123!');
    await expect(decryptVault(vault, 'pw-two-123!')).rejects.toBeInstanceOf(InvalidPasswordError);
    const bytes = Uint8Array.from(atob(vault.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered = { ...vault, data: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptVault(tampered, 'pw-one-123!')).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it('refuses weak or malformed vault parameters', async () => {
    const { vault } = await encryptVault({ a: 1 }, 'pw');
    expect(isEncryptedVault({ ...vault, kdf: { ...vault.kdf, iterations: 1000 } })).toBe(false);
    await expect(decryptVault({ ...vault, v: 2 } as never, 'pw')).rejects.toThrow(/unsupported/);
  });
});
