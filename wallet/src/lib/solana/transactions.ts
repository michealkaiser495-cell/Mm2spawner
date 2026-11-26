import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccountLenForMint,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { formatUnits } from '../format';
import { inspectTransaction, type GuardReport } from '../security/txGuard';
import type { TokenHolding } from './balances';

export type TransferAsset =
  | { kind: 'sol' }
  | { kind: 'spl'; mint: string; decimals: number; programId: string; holding: TokenHolding };

export interface SimulationResult {
  ok: boolean;
  error?: string;
  logs: string[];
  unitsConsumed?: number;
  /** post-simulation lamports of the owner account */
  ownerLamportsAfter?: bigint;
}

export interface PreparedTransaction {
  kind: 'transfer' | 'swap';
  owner: string;
  instructions?: TransactionInstruction[]; // transfers: rebuilt with fresh blockhash at signing
  tx: VersionedTransaction;
  lookupTables: AddressLookupTableAccount[];
  blockhash: string;
  lastValidBlockHeight: number;
  feeLamports: bigint;
  rentLamports: bigint;
  createsTokenAccount: boolean;
  recipientIsNew: boolean;
  simulation: SimulationResult;
  guard: GuardReport;
  warnings: string[];
  errors: string[];
}

const MAX_PRIORITY_MICROLAMPORTS = 200_000;

async function priorityFee(conn: Connection, writable: PublicKey[]): Promise<number> {
  try {
    const fees = await conn.getRecentPrioritizationFees({ lockedWritableAccounts: writable });
    const vals = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
    if (!vals.length) return 0;
    const median = vals[Math.floor(vals.length / 2)];
    return Math.min(median, MAX_PRIORITY_MICROLAMPORTS);
  } catch {
    return 0;
  }
}

export async function simulate(conn: Connection, tx: VersionedTransaction, owner: PublicKey): Promise<SimulationResult> {
  try {
    const res = await conn.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
      accounts: { addresses: [owner.toBase58()], encoding: 'base64' },
    });
    const v = res.value;
    const acct = v.accounts?.[0];
    return {
      ok: !v.err,
      error: v.err ? describeSimError(v.err, v.logs ?? []) : undefined,
      logs: v.logs ?? [],
      unitsConsumed: v.unitsConsumed,
      ownerLamportsAfter: acct ? BigInt(acct.lamports) : undefined,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message, logs: [] };
  }
}

function describeSimError(err: unknown, logs: string[]): string {
  const joined = logs.join('\n').toLowerCase();
  if (joined.includes('insufficient lamports') || joined.includes('insufficient funds')) return 'Insufficient balance';
  if (JSON.stringify(err).includes('InsufficientFundsForRent')) return 'insufficient funds for rent';
  if (JSON.stringify(err).includes('AccountNotFound')) return 'Attempt to debit an account but found no record of a prior credit';
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function compile(payer: PublicKey, ixs: TransactionInstruction[], blockhash: string, alts: AddressLookupTableAccount[] = []) {
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts),
  );
}

/**
 * Build, simulate and price a SOL or SPL transfer. Nothing is signed here.
 */
export async function prepareTransfer(params: {
  conn: Connection;
  owner: string;
  recipient: string;
  asset: TransferAsset;
  amount: bigint;
  ownerLamports: bigint;
}): Promise<PreparedTransaction> {
  const { conn, asset, amount, ownerLamports } = params;
  const from = new PublicKey(params.owner);
  const to = new PublicKey(params.recipient);
  const warnings: string[] = [];
  const errors: string[] = [];
  if (amount <= 0n) errors.push('Amount must be greater than zero.');

  const [recipientInfo, rentMin] = await Promise.all([
    conn.getAccountInfo(to),
    conn.getMinimumBalanceForRentExemption(0),
  ]);
  const recipientIsNew = !recipientInfo;
  if (recipientInfo?.executable) errors.push('Recipient is an executable program, not a wallet.');
  const recipientOwner = recipientInfo?.owner.toBase58();
  if (recipientOwner === TOKEN_PROGRAM_ID.toBase58() || recipientOwner === TOKEN_2022_PROGRAM_ID.toBase58())
    errors.push('Recipient is a token account or mint, not a wallet address. Ask the recipient for their main wallet address.');
  if (from.equals(to)) warnings.push('You are sending to your own address.');
  if (!PublicKey.isOnCurve(to.toBytes()))
    warnings.push('Recipient is a program-derived address (no private key). Make sure the receiving program supports this transfer.');

  const ixs: TransactionInstruction[] = [];
  let rentLamports = 0n;
  let createsTokenAccount = false;

  if (asset.kind === 'sol') {
    if (recipientIsNew) {
      warnings.push('Recipient address has no activity on this network yet. Double-check it.');
      if (amount < BigInt(rentMin))
        errors.push(`New accounts need at least ${formatUnits(BigInt(rentMin), 9)} SOL (rent-exempt minimum).`);
    }
    ixs.push(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amount }));
  } else {
    const mint = new PublicKey(asset.mint);
    const programId = new PublicKey(asset.programId);
    const ata = getAssociatedTokenAddressSync(mint, from, true, programId);
    const accounts = [...asset.holding.accounts].sort((a, b) => (a.address === ata.toBase58() ? -1 : b.address === ata.toBase58() ? 1 : Number(b.amount - a.amount)));
    const source = accounts.find((a) => a.amount >= amount);
    if (!source) errors.push('No single token account holds this amount. Consolidate balances first or send less.');
    const destAta = getAssociatedTokenAddressSync(mint, to, true, programId);
    const destInfo = await conn.getAccountInfo(destAta);
    if (!destInfo) {
      createsTokenAccount = true;
      let len = 165;
      if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
        const mintInfo = await getMint(conn, mint, 'confirmed', programId);
        len = getAccountLenForMint(mintInfo);
      }
      rentLamports = BigInt(await conn.getMinimumBalanceForRentExemption(len));
      warnings.push(
        `Recipient has no ${'token'} account for this asset yet. One will be created and you will pay ~${formatUnits(rentLamports, 9)} SOL in rent.`,
      );
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(from, destAta, to, mint, programId));
    }
    if (source)
      ixs.push(
        createTransferCheckedInstruction(new PublicKey(source.address), mint, destAta, from, amount, asset.decimals, [], programId),
      );
  }

  const cuPrice = await priorityFee(conn, [from]);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');

  // First pass: simulate with a generous compute limit to measure usage.
  const probe = compile(from, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ...ixs], blockhash);
  const sim = errors.length ? { ok: false, logs: [], error: errors[0] } : await simulate(conn, probe, from);
  const units = Math.max(1_000, Math.ceil((sim.unitsConsumed ?? 30_000) * 1.2) + 300);
  const budget = [ComputeBudgetProgram.setComputeUnitLimit({ units })];
  if (cuPrice > 0) budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }));
  const finalIxs = [...budget, ...ixs];
  const tx = compile(from, finalIxs, blockhash);

  const feeRes = await conn.getFeeForMessage(tx.message, 'confirmed');
  const feeLamports = BigInt(feeRes.value ?? 5000 + Math.ceil((units * cuPrice) / 1e6));

  // Balance checks (exact, with fee).
  const solOut = (asset.kind === 'sol' ? amount : 0n) + feeLamports + rentLamports;
  if (solOut > ownerLamports) errors.push('Insufficient SOL to cover the amount, network fee and any rent.');
  else {
    const remaining = ownerLamports - solOut;
    if (remaining > 0n && remaining < BigInt(rentMin))
      errors.push(
        `This would leave ${formatUnits(remaining, 9)} SOL, below the ${formatUnits(BigInt(rentMin), 9)} SOL rent-exempt minimum. Send a little less, or use Max.`,
      );
  }
  if (!sim.ok && !errors.length) errors.push(sim.error ?? 'Simulation failed');

  const guard = inspectTransaction(tx, from);
  return {
    kind: 'transfer',
    owner: params.owner,
    instructions: finalIxs,
    tx,
    lookupTables: [],
    blockhash,
    lastValidBlockHeight,
    feeLamports,
    rentLamports,
    createsTokenAccount,
    recipientIsNew,
    simulation: sim,
    guard,
    warnings,
    errors,
  };
}

export async function loadLookupTables(conn: Connection, tx: VersionedTransaction): Promise<AddressLookupTableAccount[]> {
  const lookups = tx.message.addressTableLookups;
  const res = await Promise.all(lookups.map((l) => conn.getAddressLookupTable(l.accountKey)));
  return res.map((r, i) => {
    if (!r.value) throw new Error(`Address lookup table ${lookups[i].accountKey.toBase58()} not found`);
    return r.value;
  });
}

export type TxPhase = 'signing' | 'sending' | 'confirming' | 'confirmed' | 'failed';

/**
 * Sign with the provided keypair and submit. Only called after explicit user confirmation.
 * Transfers are recompiled with a fresh blockhash (identical instructions) so a review screen
 * left open for a while does not produce an expired transaction.
 */
export async function signAndSend(
  conn: Connection,
  prepared: PreparedTransaction,
  signer: Keypair,
  onPhase: (p: TxPhase, signature?: string) => void,
): Promise<string> {
  if (prepared.guard.blocked) throw new Error('Transaction blocked by security checks');
  if (signer.publicKey.toBase58() !== prepared.owner) throw new Error('Signer does not match the active account');

  let tx = prepared.tx;
  let blockhash = prepared.blockhash;
  let lastValidBlockHeight = prepared.lastValidBlockHeight;
  if (prepared.instructions) {
    const latest = await conn.getLatestBlockhash('confirmed');
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
    tx = compile(signer.publicKey, prepared.instructions, blockhash);
    // Re-run the guard on the exact bytes being signed.
    if (inspectTransaction(tx, signer.publicKey).blocked) throw new Error('Transaction blocked by security checks');
  }

  onPhase('signing');
  tx.sign([signer]);
  onPhase('sending');
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5, preflightCommitment: 'confirmed' });
  onPhase('confirming', signature);
  const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) {
    onPhase('failed', signature);
    throw Object.assign(new Error(`Transaction failed on-chain: ${JSON.stringify(res.value.err)}`), { signature });
  }
  onPhase('confirmed', signature);
  return signature;
}

export async function requestAirdrop(conn: Connection, owner: string, sol = 1): Promise<string> {
  const pk = new PublicKey(owner);
  const sig = await conn.requestAirdrop(pk, sol * 1e9);
  const latest = await conn.getLatestBlockhash('confirmed');
  await conn.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}
