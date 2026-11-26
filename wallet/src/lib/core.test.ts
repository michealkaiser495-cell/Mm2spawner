import { describe, expect, it } from 'vitest';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import {
  createApproveInstruction,
  createCloseAccountInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  AuthorityType,
} from '@solana/spl-token';
import { formatUnits, parseUnits } from './format';
import { checkAddress } from './solana/address';
import { inspectTransaction } from './security/txGuard';
import { parseActivity } from './solana/history';
import { friendlyError } from './solana/errors';

describe('amount math', () => {
  it('parses decimals exactly into base units', () => {
    expect(parseUnits('1', 9)).toBe(1_000_000_000n);
    expect(parseUnits('0.000000001', 9)).toBe(1n);
    expect(parseUnits('1.5', 6)).toBe(1_500_000n);
    expect(parseUnits('.5', 2)).toBe(50n);
    expect(parseUnits('123456789.123456789', 9)).toBe(123456789123456789n);
  });
  it('rejects invalid or over-precise input', () => {
    expect(parseUnits('', 9)).toBeNull();
    expect(parseUnits('.', 9)).toBeNull();
    expect(parseUnits('1.2.3', 9)).toBeNull();
    expect(parseUnits('-1', 9)).toBeNull();
    expect(parseUnits('1e5', 9)).toBeNull();
    expect(parseUnits('0.1234567', 6)).toBeNull();
  });
  it('formats without floating point error', () => {
    expect(formatUnits(1n, 9)).toBe('0.000000001');
    expect(formatUnits(1_500_000n, 6)).toBe('1.5');
    expect(formatUnits(10n ** 18n, 9)).toBe('1000000000');
    expect(formatUnits(-25n, 1)).toBe('-2.5');
  });
});

describe('address validation', () => {
  it('accepts wallets and flags PDAs', () => {
    const kp = Keypair.generate();
    const r = checkAddress(kp.publicKey.toBase58());
    expect(r.valid && r.onCurve).toBe(true);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('x')], SystemProgram.programId);
    const p = checkAddress(pda.toBase58());
    expect(p.valid && !p.onCurve).toBe(true);
  });
  it('rejects other chains, garbage and system addresses', () => {
    expect(checkAddress('0x52908400098527886E0F7030069857D2E4169EE7').valid).toBe(false);
    expect(checkAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq').valid).toBe(false);
    expect(checkAddress('hello').valid).toBe(false);
    expect(checkAddress('').valid).toBe(false);
    expect(checkAddress('11111111111111111111111111111111').valid).toBe(false);
    expect(checkAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').valid).toBe(false);
    expect(checkAddress('So11111111111111111111111111111111111111112').valid).toBe(false);
  });
});

describe('transaction guard', () => {
  const owner = Keypair.generate().publicKey;
  const attacker = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const tokenAcct = Keypair.generate().publicKey;
  const build = (payer: PublicKey, ixs: TransactionInstruction[]) =>
    new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: '11111111111111111111111111111111', instructions: ixs }).compileToV0Message());

  it('passes a plain transfer', () => {
    const r = inspectTransaction(build(owner, [SystemProgram.transfer({ fromPubkey: owner, toPubkey: attacker, lamports: 1 })]), owner);
    expect(r.blocked).toBe(false);
    const r2 = inspectTransaction(build(owner, [createTransferCheckedInstruction(tokenAcct, mint, attacker, owner, 1n, 6)]), owner);
    expect(r2.blocked).toBe(false);
  });
  it('blocks token approvals (unlimited allowance pattern)', () => {
    const r = inspectTransaction(build(owner, [createApproveInstruction(tokenAcct, attacker, owner, 2n ** 64n - 1n)]), owner);
    expect(r.blocked).toBe(true);
  });
  it('blocks authority changes', () => {
    const r = inspectTransaction(build(owner, [createSetAuthorityInstruction(tokenAcct, owner, AuthorityType.AccountOwner, attacker)]), owner);
    expect(r.blocked).toBe(true);
  });
  it('blocks closing accounts to a third party, allows closing to self', () => {
    expect(inspectTransaction(build(owner, [createCloseAccountInstruction(tokenAcct, attacker, owner)]), owner).blocked).toBe(true);
    expect(inspectTransaction(build(owner, [createCloseAccountInstruction(tokenAcct, owner, owner)]), owner).blocked).toBe(false);
  });
  it('blocks System Assign of the wallet account', () => {
    expect(inspectTransaction(build(owner, [SystemProgram.assign({ accountPubkey: owner, programId: attacker })]), owner).blocked).toBe(true);
  });
  it('blocks a foreign fee payer', () => {
    expect(inspectTransaction(build(attacker, [SystemProgram.transfer({ fromPubkey: owner, toPubkey: attacker, lamports: 1 })]), owner).blocked).toBe(true);
  });
});

describe('history parsing', () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const other = Keypair.generate().publicKey.toBase58();
  const tx = (pre: number, post: number, payer: string, ix: unknown): ParsedTransactionWithMeta =>
    ({
      slot: 1,
      blockTime: 1_700_000_000,
      meta: { fee: 5000, err: null, preBalances: [pre, 0], postBalances: [post, 0], preTokenBalances: [], postTokenBalances: [], innerInstructions: [] },
      transaction: {
        signatures: ['sig'],
        message: {
          accountKeys: [
            { pubkey: new PublicKey(payer), signer: true, writable: true },
            { pubkey: new PublicKey(payer === owner ? other : owner), signer: false, writable: true },
          ],
          instructions: [ix],
          recentBlockhash: '1',
        },
      },
    }) as unknown as ParsedTransactionWithMeta;

  it('classifies an outgoing SOL transfer, excluding the fee', () => {
    const a = parseActivity(
      tx(2_000_000_000, 999_995_000, owner, { program: 'system', programId: SystemProgram.programId, parsed: { type: 'transfer', info: { source: owner, destination: other, lamports: 1e9 } } }),
      'sig',
      owner,
    );
    expect(a.type).toBe('send');
    expect(a.changes[0]).toMatchObject({ mint: 'SOL', delta: -1_000_000_000n });
    expect(a.counterparty).toBe(other);
    expect(a.status).toBe('success');
  });
});

describe('error messages', () => {
  it('maps common RPC errors to actionable text', () => {
    expect(friendlyError(new Error('429 Too Many Requests'))).toMatch(/rate-limiting/);
    expect(friendlyError(new Error('Blockhash not found'))).toMatch(/NOT processed/);
    expect(friendlyError(new Error('Failed to fetch'))).toMatch(/reach the network/);
  });
});
