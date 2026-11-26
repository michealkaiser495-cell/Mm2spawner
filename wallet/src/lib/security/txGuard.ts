/**
 * Transaction guard — inspects any transaction BEFORE it is shown for signing.
 *
 * The wallet never signs silently; this adds a second line of defence by decoding the
 * instructions and refusing patterns commonly used by drainers:
 *   - a fee payer other than the active account
 *   - SPL token Approve / ApproveChecked (delegating spend rights — "unlimited approvals")
 *   - SPL token SetAuthority (handing ownership of a token account to someone else)
 *   - CloseAccount sending reclaimed rent anywhere but the user
 *   - System Assign / AssignWithSeed (re-assigning the wallet account to a program)
 */
import {
  type AddressLookupTableAccount,
  type PublicKey,
  SystemProgram,
  type VersionedTransaction,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export type IssueLevel = 'block' | 'warn' | 'info';
export interface GuardIssue {
  level: IssueLevel;
  message: string;
}
export interface GuardReport {
  issues: GuardIssue[];
  programs: string[];
  blocked: boolean;
}

const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
const SYSTEM = SystemProgram.programId.toBase58();

export const KNOWN_PROGRAMS: Record<string, string> = {
  [SYSTEM]: 'System Program',
  [TOKEN_PROGRAM_ID.toBase58()]: 'SPL Token',
  [TOKEN_2022_PROGRAM_ID.toBase58()]: 'SPL Token-2022',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Account',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator v6',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo',
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'Memo (v1)',
};

export function inspectTransaction(
  tx: VersionedTransaction,
  owner: PublicKey,
  lookupTables: AddressLookupTableAccount[] = [],
  expectedPrograms?: Set<string>,
): GuardReport {
  const issues: GuardIssue[] = [];
  const msg = tx.message;
  const ownerStr = owner.toBase58();
  const keys = msg.getAccountKeys({ addressLookupTableAccounts: lookupTables });
  const key = (i: number) => keys.get(i)?.toBase58();

  if (msg.staticAccountKeys[0]?.toBase58() !== ownerStr) {
    issues.push({ level: 'block', message: 'Fee payer is not your account.' });
  }
  if (msg.header.numRequiredSignatures !== 1) {
    issues.push({
      level: 'block',
      message: `Transaction requires ${msg.header.numRequiredSignatures} signatures; only a single-signer transaction is supported.`,
    });
  }

  const programs = new Set<string>();
  for (const ix of msg.compiledInstructions) {
    const pid = key(ix.programIdIndex);
    if (!pid) {
      issues.push({ level: 'block', message: 'Instruction references an unknown program.' });
      continue;
    }
    programs.add(pid);
    const data = ix.data;
    const acct = (n: number) => key(ix.accountKeyIndexes[n]);

    if (TOKEN_PROGRAMS.has(pid)) {
      const op = data[0];
      if (op === 4 || op === 13)
        issues.push({ level: 'block', message: 'Requests a token spending approval (delegate). Nocta never grants token approvals.' });
      if (op === 6) issues.push({ level: 'block', message: 'Attempts to change the authority/owner of a token account.' });
      if (op === 9 && acct(1) !== ownerStr)
        issues.push({ level: 'block', message: 'Closes a token account and sends its balance to another address.' });
    } else if (pid === SYSTEM && data.length >= 4) {
      const op = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
      if ((op === 1 || op === 10) && acct(0) === ownerStr)
        issues.push({ level: 'block', message: 'Attempts to re-assign ownership of your wallet account to a program.' });
    }
  }

  const list = [...programs];
  const unknown = list.filter((p) => !KNOWN_PROGRAMS[p] && !expectedPrograms?.has(p));
  if (unknown.length)
    issues.push({
      level: expectedPrograms ? 'warn' : 'info',
      message: `Interacts with ${unknown.length} program(s) not recognised by Nocta.`,
    });

  return { issues, programs: list, blocked: issues.some((i) => i.level === 'block') };
}
