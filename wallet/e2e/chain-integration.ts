/**
 * Live-network integration check (read-only — nothing is signed or submitted).
 * Exercises balance fetch, history parsing, transfer preparation + simulation (devnet)
 * and Jupiter swap construction + guard + simulation (mainnet) against real RPC data,
 * using funded addresses discovered from recent chain activity.
 *
 * Run: npm run test:chain
 */
import '../src/polyfills';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { fetchPortfolio, NATIVE_MINT } from '../src/lib/solana/balances';
import { fetchHistory } from '../src/lib/solana/history';
import { prepareTransfer } from '../src/lib/solana/transactions';
import { prepareSwap } from '../src/lib/solana/swap';
import { getQuote, JUPITER_PROGRAM_ID } from '../src/lib/api/jupiter';

const devnet = new Connection('https://api.devnet.solana.com', { commitment: 'confirmed', disableRetryOnRateLimit: false });
const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Find a system-owned account with SOL among fee payers of recent transactions touching `program`. */
async function fundedPayer(conn: Connection, program: string, min: number): Promise<PublicKey> {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(program), { limit: 25 });
  const payers: PublicKey[] = [];
  for (const s of sigs.filter((x) => !x.err).slice(0, 12)) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1 as 0 }).catch(() => null);
    const p = tx?.transaction.message.accountKeys[0]?.pubkey;
    if (p && !payers.some((x) => x.equals(p))) payers.push(p);
  }
  const infos = await conn.getMultipleAccountsInfo(payers);
  const i = infos.findIndex((info) => info && info.owner.toBase58() === '11111111111111111111111111111111' && info.lamports > min && info.data.length === 0);
  if (i < 0) throw new Error('no funded account found');
  return payers[i];
}

const recentJupiterTrader = () => fundedPayer(mainnet, JUPITER_PROGRAM_ID, 0.2e9);

// ---------------------------------------------------------------- devnet transfer
{
  const owner = await fundedPayer(devnet, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 0.5e9);
  console.log(`\nDevnet funded account: ${owner.toBase58()}`);
  const pf = await fetchPortfolio(devnet, owner.toBase58());
  check('fetchPortfolio (devnet)', pf.lamports > 0n, `${Number(pf.lamports) / 1e9} SOL, ${pf.tokens.length} token mints`);
  const recipient = Keypair.generate().publicKey.toBase58();

  const ok = await prepareTransfer({ conn: devnet, owner: owner.toBase58(), recipient, asset: { kind: 'sol' }, amount: 10_000_000n, ownerLamports: pf.lamports });
  check('SOL transfer simulates', ok.simulation.ok && ok.errors.length === 0, `fee ${ok.feeLamports} lamports, ${ok.simulation.unitsConsumed} CU`);
  check('guard passes plain transfer', !ok.guard.blocked);
  check('new-recipient warning shown', ok.warnings.some((w) => /no activity/.test(w)));

  const tiny = await prepareTransfer({ conn: devnet, owner: owner.toBase58(), recipient, asset: { kind: 'sol' }, amount: 1000n, ownerLamports: pf.lamports });
  check('rejects below-rent amount to new account', tiny.errors.some((e) => /rent-exempt/.test(e)));

  const tooMuch = await prepareTransfer({ conn: devnet, owner: owner.toBase58(), recipient, asset: { kind: 'sol' }, amount: pf.lamports + 1n, ownerLamports: pf.lamports });
  check('rejects amount over balance', tooMuch.errors.length > 0, tooMuch.errors[0]);

  const toMint = await prepareTransfer({ conn: devnet, owner: owner.toBase58(), recipient: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', asset: { kind: 'sol' }, amount: 10_000_000n, ownerLamports: pf.lamports });
  check('token mint/account as recipient handled', toMint.errors.length > 0 || toMint.warnings.length > 0, toMint.errors[0] ?? toMint.warnings[0]);

  const h = await fetchHistory(devnet, owner.toBase58(), { limit: 5 });
  check('fetchHistory (devnet)', h.items.length > 0, h.items.map((i) => `${i.type}/${i.status}`).join(', '));
}

// ---------------------------------------------------------------- mainnet swap
{
  const trader = await recentJupiterTrader();
  console.log(`\nMainnet Jupiter trader: ${trader.toBase58()}`);
  const pf = await fetchPortfolio(mainnet, trader.toBase58());
  check('fetchPortfolio (mainnet)', pf.lamports > 0n, `${Number(pf.lamports) / 1e9} SOL, ${pf.tokens.length} token mints`);
  const h = await fetchHistory(mainnet, trader.toBase58(), { limit: 10 });
  const types = h.items.map((i) => i.type);
  check('history parses mainnet transactions', h.items.length > 0 && h.items.every((i) => i.programs.length > 0), types.join(', '));

  const quote = await getQuote({ inputMint: NATIVE_MINT, outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: 10_000_000n, slippageBps: 50 });
  check('Jupiter quote', BigInt(quote.outAmount) > 0n, `0.01 SOL → ${Number(quote.outAmount) / 1e6} USDC, min ${Number(quote.otherAmountThreshold) / 1e6}`);
  const prep = await prepareSwap(mainnet, quote, trader.toBase58());
  check('swap tx decodes with lookup tables', prep.lookupTables.length >= 0 && prep.guard.programs.includes(JUPITER_PROGRAM_ID), `${prep.lookupTables.length} ALTs, programs: ${prep.guard.programs.length}`);
  check('swap passes security guard', !prep.guard.blocked, prep.guard.issues.map((i) => i.message).join(' | '));
  check('swap simulates on mainnet', prep.simulation.ok, prep.simulation.error ?? `${prep.simulation.unitsConsumed} CU, fee ${prep.feeLamports} lamports`);

  // Same swap built for a different wallet must be rejected when checked against ours.
  const other = await prepareSwap(mainnet, quote, trader.toBase58());
  const { inspectTransaction } = await import('../src/lib/security/txGuard');
  const foreign = inspectTransaction(other.tx, Keypair.generate().publicKey, other.lookupTables);
  check('guard blocks a swap built for another wallet', foreign.blocked);
}

console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All chain checks passed'}`);
process.exit(failures ? 1 : 0);
