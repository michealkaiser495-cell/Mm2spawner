import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import type { PreparedTransaction, TxPhase } from '@/lib/solana/transactions';
import { KNOWN_PROGRAMS } from '@/lib/security/txGuard';
import { explorerTxUrl, type SolanaNetwork } from '@/lib/solana/networks';
import { formatAmount, shortAddress, toNumber } from '@/lib/format';
import { friendlyError } from '@/lib/solana/errors';
import { Button, cn, Notice } from '../ui/primitives';

/** Security & simulation summary shown on every review screen. */
export function TxSafetyPanel({ prepared }: { prepared: PreparedTransaction }) {
  const { guard, simulation, warnings, errors } = prepared;
  return (
    <div className="space-y-2.5">
      {guard.issues
        .filter((i) => i.level === 'block')
        .map((i, k) => (
          <Notice key={`b${k}`} tone="danger" title="Blocked for your safety">
            {i.message}
          </Notice>
        ))}
      {errors.map((e, k) => (
        <Notice key={`e${k}`} tone="danger" title="Can't send this transaction">
          {friendlyError(e)}
        </Notice>
      ))}
      {warnings.map((w, k) => (
        <Notice key={`w${k}`} tone="warn">
          {w}
        </Notice>
      ))}
      {guard.issues
        .filter((i) => i.level !== 'block')
        .map((i, k) => (
          <Notice key={`g${k}`} tone={i.level === 'warn' ? 'warn' : 'info'}>
            {i.message}
          </Notice>
        ))}
      {!guard.blocked && !errors.length && simulation.ok && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-up/20 bg-up/[0.06] p-3 text-sm text-up">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            Simulation succeeded · security checks passed
            {simulation.unitsConsumed ? <span className="text-up/70"> · {simulation.unitsConsumed.toLocaleString()} CU</span> : null}
          </span>
        </div>
      )}
      <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-mist-400">
        <summary className="cursor-pointer select-none py-1 font-medium text-mist-300">Programs invoked ({guard.programs.length})</summary>
        <ul className="mt-1 space-y-1 pb-1">
          {guard.programs.map((p) => (
            <li key={p} className="flex justify-between gap-3 font-mono">
              <span className="text-mist-200">{KNOWN_PROGRAMS[p] ?? 'Unknown program'}</span>
              <span>{shortAddress(p, 5)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function feeLine(prepared: PreparedTransaction) {
  return `${formatAmount(toNumber(prepared.feeLamports, 9), 9)} SOL`;
}

const PHASE_TEXT: Record<TxPhase, string> = {
  signing: 'Signing on your device…',
  sending: 'Submitting to the network…',
  confirming: 'Waiting for confirmation…',
  confirmed: 'Confirmed',
  failed: 'Failed',
};

export function TxStatus({
  phase,
  signature,
  error,
  network,
  title,
  onDone,
  onRetry,
}: {
  phase: TxPhase;
  signature?: string;
  error?: string;
  network: SolanaNetwork;
  title: string;
  onDone: () => void;
  onRetry?: () => void;
}) {
  const pending = phase === 'signing' || phase === 'sending' || phase === 'confirming';
  const ok = phase === 'confirmed';
  return (
    <div className="py-4 text-center" role="status" aria-live="polite">
      <div
        className={cn(
          'mx-auto grid h-20 w-20 place-items-center rounded-full',
          pending && 'animate-pulse-ring bg-white/[0.06]',
          ok && 'bg-up/15 text-up',
          phase === 'failed' && 'bg-down/15 text-down',
        )}
      >
        {pending ? <Loader2 className="h-9 w-9 animate-spin text-accent" /> : ok ? <CheckCircle2 className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold" data-testid="tx-status">
        {pending ? 'Pending' : ok ? title : 'Transaction failed'}
      </h2>
      <p className="mt-1 text-sm text-mist-400">{PHASE_TEXT[phase]}</p>
      {error && <p className="mx-auto mt-3 max-w-sm break-words text-sm text-down">{error}</p>}
      {signature && (
        <a href={explorerTxUrl(network, signature)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          View on Solana Explorer <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {!pending && (
        <div className="mx-auto mt-7 flex max-w-xs gap-2">
          {phase === 'failed' && onRetry && (
            <Button block onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button block variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
