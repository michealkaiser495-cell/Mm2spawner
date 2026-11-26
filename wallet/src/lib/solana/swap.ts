import { type Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { buildSwapTransaction, JUPITER_PROGRAM_ID, type QuoteResponse } from '../api/jupiter';
import { base64ToBytes } from '../crypto/encoding';
import { inspectTransaction } from '../security/txGuard';
import { loadLookupTables, simulate, type PreparedTransaction } from './transactions';

/**
 * Fetch the unsigned swap transaction from Jupiter, then independently verify it:
 * decode instructions (resolving lookup tables), run the security guard, require the
 * Jupiter program, and simulate against the RPC. Nothing is signed here.
 */
export async function prepareSwap(conn: Connection, quote: QuoteResponse, owner: string): Promise<PreparedTransaction> {
  const ownerPk = new PublicKey(owner);
  const res = await buildSwapTransaction(quote, owner);
  const tx = VersionedTransaction.deserialize(base64ToBytes(res.swapTransaction));
  const lookupTables = await loadLookupTables(conn, tx);
  const guard = inspectTransaction(tx, ownerPk, lookupTables, new Set([JUPITER_PROGRAM_ID]));
  if (!guard.programs.includes(JUPITER_PROGRAM_ID)) {
    guard.issues.push({ level: 'block', message: 'Swap transaction does not invoke the Jupiter aggregator program.' });
    guard.blocked = true;
  }

  const [simulation, feeRes] = await Promise.all([
    simulate(conn, tx, ownerPk),
    conn.getFeeForMessage(tx.message, 'confirmed'),
  ]);
  const errors: string[] = [];
  if (!simulation.ok) errors.push(simulation.error ?? 'Simulation failed');

  return {
    kind: 'swap',
    owner,
    tx,
    lookupTables,
    blockhash: tx.message.recentBlockhash,
    lastValidBlockHeight: res.lastValidBlockHeight,
    feeLamports: BigInt(feeRes.value ?? 5000 + (res.prioritizationFeeLamports ?? 0)),
    rentLamports: 0n,
    createsTokenAccount: false,
    recipientIsNew: false,
    simulation,
    guard,
    warnings: [],
    errors,
  };
}
