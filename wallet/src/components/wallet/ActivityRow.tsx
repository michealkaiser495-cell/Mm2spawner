import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Repeat, Sparkles, XCircle } from 'lucide-react';
import type { Activity, BalanceChange } from '@/lib/solana/history';
import type { JupToken } from '@/lib/api/jupiter';
import { formatAmount, shortAddress, timeAgo, toNumber } from '@/lib/format';
import { cn } from '../ui/primitives';

export const TYPE_LABEL: Record<Activity['type'], string> = {
  send: 'Sent',
  receive: 'Received',
  swap: 'Swapped',
  self: 'Self transfer',
  interaction: 'App interaction',
};

export function changeLabel(c: BalanceChange, info: Record<string, JupToken>) {
  const sym = c.mint === 'SOL' ? 'SOL' : info[c.mint]?.symbol ?? shortAddress(c.mint, 3);
  const n = toNumber(c.delta, c.decimals);
  return `${n > 0 ? '+' : ''}${formatAmount(n)} ${sym}`;
}

/** For swaps, collapse SOL<->wSOL noise and pick the main in/out legs. */
export function primaryChanges(a: Activity) {
  const out = a.changes.filter((c) => c.delta < 0n);
  const inn = a.changes.filter((c) => c.delta > 0n);
  return { out, inn };
}

export function ActivityIcon({ a, size = 40 }: { a: Activity; size?: number }) {
  const Icon = a.status === 'failed' ? XCircle : a.type === 'send' ? ArrowUpRight : a.type === 'receive' ? ArrowDownLeft : a.type === 'swap' ? ArrowLeftRight : a.type === 'self' ? Repeat : Sparkles;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        a.status === 'failed' ? 'bg-down/12 text-down' : a.type === 'receive' ? 'bg-up/12 text-up' : 'bg-white/[0.06] text-mist-200',
      )}
      style={{ width: size, height: size }}
    >
      <Icon className="h-[45%] w-[45%]" />
    </span>
  );
}

export function ActivityRow({ a, info, hideAmounts }: { a: Activity; info: Record<string, JupToken>; hideAmounts?: boolean }) {
  const { out, inn } = primaryChanges(a);
  const main = a.type === 'receive' ? inn[0] : a.type === 'swap' ? inn[0] : out[0] ?? inn[0];
  const sub =
    a.type === 'swap' && out[0] ? changeLabel(out[0], info) : a.counterparty ? `${a.type === 'receive' ? 'From' : 'To'} ${shortAddress(a.counterparty)}` : a.programs.length ? `${a.programs.length} program${a.programs.length > 1 ? 's' : ''}` : '';
  return (
    <Link to={`/activity/${a.signature}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/[0.04]">
      <ActivityIcon a={a} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          {TYPE_LABEL[a.type]}
          {a.status === 'failed' && <span className="rounded-md bg-down/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-down">Failed</span>}
        </p>
        <p className="truncate text-[13px] text-mist-400">{sub || shortAddress(a.signature, 6)}</p>
      </div>
      <div className="text-right">
        {main && (
          <p className={cn('num text-[15px] font-semibold', main.delta > 0n ? 'text-up' : 'text-mist-100')}>
            {hideAmounts ? '••••' : changeLabel(main, info)}
          </p>
        )}
        <p className="text-[12px] text-mist-400">{timeAgo(a.blockTime)}</p>
      </div>
    </Link>
  );
}
