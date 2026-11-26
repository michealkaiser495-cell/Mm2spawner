import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { Activity as ActivityItem } from '@/lib/solana/history';
import { friendlyError } from '@/lib/solana/errors';
import { useHistory } from '@/hooks/useHistory';
import { useTokenInfo } from '@/hooks/useTokenInfo';
import { useNetwork } from '@/hooks/useNetwork';
import { useSettings } from '@/state/settings';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, EmptyState, ErrorState, Segmented, Skeleton } from '@/components/ui/primitives';
import { ActivityRow } from '@/components/wallet/ActivityRow';

type Filter = 'all' | 'send' | 'receive' | 'swap' | 'failed';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'send', label: 'Sent' },
  { value: 'receive', label: 'Received' },
  { value: 'swap', label: 'Swaps' },
  { value: 'failed', label: 'Failed' },
];

function dayLabel(ts: number | null) {
  if (!ts) return 'Pending';
  const d = new Date(ts * 1000);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function Activity() {
  const h = useHistory(25);
  const { config } = useNetwork();
  const hide = useSettings((s) => s.hideBalances);
  const [filter, setFilter] = useState<Filter>('all');
  const all = useMemo(() => h.data?.pages.flatMap((p) => p.items) ?? [], [h.data]);
  const info = useTokenInfo(all.flatMap((a) => a.changes.map((c) => c.mint)));
  const items = all.filter((a) => (filter === 'all' ? true : filter === 'failed' ? a.status === 'failed' : a.type === filter));

  const groups = useMemo(() => {
    const out: { label: string; items: ActivityItem[] }[] = [];
    for (const a of items) {
      const label = dayLabel(a.blockTime);
      const g = out[out.length - 1];
      if (g?.label === label) g.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Activity" subtitle={`Transactions on ${config.label}`} />
      <div className="scrollbar-none mb-4 overflow-x-auto">
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
      </div>
      <Card className="p-3 sm:p-4">
        {h.isLoading ? (
          <div className="space-y-3 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : h.isError ? (
          <div className="p-2">
            <ErrorState error={new Error(friendlyError(h.error))} onRetry={() => h.refetch()} title="Couldn't load history" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title={filter === 'all' ? 'No transactions yet' : 'Nothing matches this filter'} body={filter === 'all' ? `Activity for this account on ${config.short} will appear here.` : undefined} />
        ) : (
          groups.map((g) => (
            <section key={g.label} className="mb-2">
              <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-mist-400">{g.label}</h3>
              {g.items.map((a) => (
                <ActivityRow key={a.signature} a={a} info={info.data} hideAmounts={hide} />
              ))}
            </section>
          ))
        )}
        {h.hasNextPage && (
          <div className="p-2">
            <Button block onClick={() => h.fetchNextPage()} loading={h.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
