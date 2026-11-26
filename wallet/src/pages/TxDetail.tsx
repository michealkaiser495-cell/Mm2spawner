import { useParams } from 'react-router-dom';
import { Copy, ExternalLink } from 'lucide-react';
import { KNOWN_PROGRAMS } from '@/lib/security/txGuard';
import { explorerTxUrl } from '@/lib/solana/networks';
import { friendlyError } from '@/lib/solana/errors';
import { formatAmount, formatDateTime, shortAddress, toNumber } from '@/lib/format';
import { useActivity } from '@/hooks/useHistory';
import { useTokenInfo } from '@/hooks/useTokenInfo';
import { useNetwork } from '@/hooks/useNetwork';
import { useClipboard } from '@/hooks/useClipboard';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Card, cn, ErrorState, Row, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { ActivityIcon, TYPE_LABEL } from '@/components/wallet/ActivityRow';

export function TxDetail() {
  const { signature = '' } = useParams();
  const { network, config } = useNetwork();
  const account = useActiveAccount();
  const q = useActivity(signature);
  const a = q.data;
  const info = useTokenInfo(a?.changes.map((c) => c.mint) ?? []);
  const { copy } = useClipboard();

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Transaction" back="/activity" />
      {q.isLoading ? (
        <Card className="space-y-4 p-6">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : q.isError ? (
        <ErrorState error={new Error(friendlyError(q.error))} onRetry={() => q.refetch()} />
      ) : !a ? (
        <ErrorState error={new Error(`Transaction not found on ${config.label}. It may be on a different network, or not yet confirmed.`)} onRetry={() => q.refetch()} title="Not found" />
      ) : (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col items-center text-center">
            <ActivityIcon a={a} size={60} />
            <h2 className="mt-3 font-display text-xl font-bold">{TYPE_LABEL[a.type]}</h2>
            <div className="mt-1.5">
              {a.status === 'success' ? <Badge tone="up">Confirmed</Badge> : <Badge tone="down">Failed</Badge>}
            </div>
          </div>

          {a.changes.length > 0 && (
            <div className="mt-6">
              <SectionTitle>Balance changes</SectionTitle>
              <div className="space-y-2">
                {a.changes.map((c) => {
                  const t = info.data[c.mint];
                  const sym = c.mint === 'SOL' ? 'SOL' : t?.symbol ?? 'Unknown';
                  const n = toNumber(c.delta, c.decimals);
                  return (
                    <div key={c.mint} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <TokenIcon symbol={sym} icon={t?.icon} mint={c.mint} isNative={c.mint === 'SOL'} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{sym}</span>
                        {c.mint !== 'SOL' && <span className="block font-mono text-xs text-mist-400">{shortAddress(c.mint)}</span>}
                      </span>
                      <span className={cn('num font-semibold', n > 0 ? 'text-up' : 'text-mist-100')}>
                        {n > 0 ? '+' : ''}
                        {formatAmount(n)} {sym}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
            <Row label="Date">{formatDateTime(a.blockTime)}</Row>
            <Row label="Status">{a.status === 'success' ? <span className="text-up">Success</span> : <span className="text-down">Failed</span>}</Row>
            {a.error && <Row label="Error"><span className="break-all font-mono text-xs text-down">{a.error}</span></Row>}
            <Row label="Network">{config.label}</Row>
            <Row label="Account">
              <span className="font-mono text-[13px]">{account ? shortAddress(account.publicKey, 6) : ''}</span>
            </Row>
            {a.counterparty && (
              <Row label={a.type === 'receive' ? 'From' : 'To'}>
                <button onClick={() => copy(a.counterparty!, { label: 'Address' })} className="inline-flex items-center gap-1.5 font-mono text-[13px] hover:text-accent">
                  {shortAddress(a.counterparty, 6)} <Copy className="h-3.5 w-3.5" />
                </button>
              </Row>
            )}
            <Row label="Network fee">
              {formatAmount(toNumber(a.fee, 9), 9)} SOL {!a.feePaidByOwner && <span className="text-mist-400">(paid by another account)</span>}
            </Row>
            <Row label="Slot">{a.slot.toLocaleString()}</Row>
            <Row label="Signature">
              <button onClick={() => copy(a.signature, { label: 'Signature' })} className="inline-flex items-center gap-1.5 font-mono text-[13px] hover:text-accent">
                {shortAddress(a.signature, 8)} <Copy className="h-3.5 w-3.5" />
              </button>
            </Row>
          </div>

          {a.programs.length > 0 && (
            <div className="mt-5">
              <SectionTitle>Programs</SectionTitle>
              <ul className="space-y-1.5 text-sm">
                {a.programs.map((p) => (
                  <li key={p} className="flex justify-between gap-3">
                    <span>{KNOWN_PROGRAMS[p] ?? 'Unknown program'}</span>
                    <span className="font-mono text-xs text-mist-400">{shortAddress(p, 5)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <a
            href={explorerTxUrl(network, a.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium hover:bg-white/[0.1]"
          >
            View on Solana Explorer <ExternalLink className="h-4 w-4" />
          </a>
        </Card>
      )}
    </div>
  );
}
