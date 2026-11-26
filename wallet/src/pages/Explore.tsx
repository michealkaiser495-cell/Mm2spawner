import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Compass, Search, X } from 'lucide-react';
import { getTopTokens, searchTokens, type JupToken, type TokenCategory } from '@/lib/api/jupiter';
import { formatCompact, formatPct } from '@/lib/format';
import { useFiat } from '@/hooks/useFiat';
import { useNetwork } from '@/hooks/useNetwork';
import { useSettings } from '@/state/settings';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, cn, EmptyState, ErrorState, Notice, Segmented, Skeleton } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { VerifyBadge } from '@/components/wallet/VerifyBadge';

const TABS: { value: TokenCategory; label: string }[] = [
  { value: 'toptrending', label: 'Trending' },
  { value: 'toporganicscore', label: 'Top' },
  { value: 'toptraded', label: 'Most traded' },
];

function TokenRow({ t, rank }: { t: JupToken; rank?: number }) {
  const navigate = useNavigate();
  const { fmt, convert, currency } = useFiat();
  const ch = t.stats24h?.priceChange;
  return (
    <button onClick={() => navigate(`/explore/${t.id}`)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04] sm:grid-cols-[2rem_auto_1fr_8rem_6rem_7rem]">
      <span className="hidden text-sm text-mist-400 sm:block">{rank ?? ''}</span>
      <TokenIcon symbol={t.symbol} icon={t.icon} mint={t.id} size={40} />
      <span className="min-w-0">
        <span className="flex items-center gap-2 truncate font-semibold">
          <span className="truncate">{t.name}</span>
          <VerifyBadge verified={!!t.isVerified} />
        </span>
        <span className="text-[13px] text-mist-400">{t.symbol}</span>
      </span>
      <span className="text-right sm:order-none">
        <span className="num block font-semibold">{t.usdPrice != null ? fmt(t.usdPrice, { ignoreHide: true }) : '—'}</span>
        <span className={cn('block text-[12px] font-medium sm:hidden', (ch ?? 0) >= 0 ? 'text-up' : 'text-down')}>{formatPct(ch)}</span>
      </span>
      <span className={cn('hidden text-right text-sm font-medium sm:block', (ch ?? 0) >= 0 ? 'text-up' : 'text-down')}>{formatPct(ch)}</span>
      <span className="hidden text-right text-sm text-mist-300 sm:block">{t.mcap ? formatCompact(convert(t.mcap), currency) : '—'}</span>
    </button>
  );
}

export function Explore() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [tab, setTab] = useState<TokenCategory>('toptrending');
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const { config } = useNetwork();
  const term = q.trim();

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  const list = useQuery({
    queryKey: ['top-tokens', tab],
    queryFn: () => getTopTokens(tab, 50),
    enabled: fetchMarketData && !term,
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: ['explore-search', term],
    queryFn: () => searchTokens(term),
    enabled: fetchMarketData && term.length >= 2,
    staleTime: 60_000,
  });
  const active = term ? search : list;
  const data = active.data ?? [];

  return (
    <div>
      <PageHeader title="Explore" subtitle="Discover Solana tokens. Prices and market data via Jupiter." />
      {config.isTestnet && <Notice className="mb-4">Market data reflects Solana Mainnet. Tokens shown here are not on {config.short}.</Notice>}
      {!fetchMarketData ? (
        <Card>
          <EmptyState icon={<Compass className="h-6 w-6" />} title="Market data is disabled" body="Enable “Fetch market data” in Settings → Privacy to explore tokens." />
        </Card>
      ) : (
        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 px-1 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="relative flex-1 sm:max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                setParams(term ? { q: term } : {});
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, symbol or mint address" aria-label="Search tokens" className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.03] pl-9 pr-9 text-sm outline-none focus:border-[var(--accent-from)]" data-testid="explore-search" />
              {q && (
                <button type="button" onClick={() => { setQ(''); setParams({}); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-mist-400 hover:text-mist-100" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
            {!term && <Segmented value={tab} onChange={setTab} options={TABS} size="sm" />}
          </div>
          <div className="hidden grid-cols-[2rem_auto_1fr_8rem_6rem_7rem] gap-3 border-b border-white/[0.05] px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-mist-400 sm:grid">
            <span>#</span>
            <span className="col-span-2">Token</span>
            <span className="text-right">Price</span>
            <span className="text-right">24h</span>
            <span className="text-right">Market cap</span>
          </div>
          {active.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : active.isError ? (
            <div className="p-2">
              <ErrorState error={active.error} onRetry={() => active.refetch()} title="Couldn't load tokens" />
            </div>
          ) : term.length === 1 ? (
            <p className="py-10 text-center text-sm text-mist-400">Keep typing…</p>
          ) : data.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No tokens found" body="Try a symbol like JUP, or paste a mint address." />
          ) : (
            <div className="mt-1">
              {data.map((t, i) => (
                <TokenRow key={t.id} t={t} rank={term ? undefined : i + 1} />
              ))}
            </div>
          )}
          <p className="px-3 pt-3 text-[11px] text-mist-400">Listing here is not an endorsement. “Verified” reflects Jupiter’s registry and does not mean a token is safe.</p>
        </Card>
      )}
    </div>
  );
}
