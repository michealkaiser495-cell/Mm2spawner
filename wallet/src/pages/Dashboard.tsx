import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, Droplets, ExternalLink, Eye, EyeOff, History, LineChart, RefreshCw, Search, Wallet } from 'lucide-react';
import type { ChartRange } from '@/lib/api/coingecko';
import { formatAmount, formatPct } from '@/lib/format';
import { requestAirdrop } from '@/lib/solana/transactions';
import { friendlyError } from '@/lib/solana/errors';
import { usePortfolio, type Asset } from '@/hooks/usePortfolio';
import { usePortfolioChart } from '@/hooks/useCharts';
import { useExternalAssets } from '@/hooks/useExternalChain';
import { useHistory } from '@/hooks/useHistory';
import { useTokenInfo } from '@/hooks/useTokenInfo';
import { useFiat } from '@/hooks/useFiat';
import { useClipboard } from '@/hooks/useClipboard';
import { useNetwork } from '@/hooks/useNetwork';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { Badge, Button, Card, cn, EmptyState, ErrorState, Notice, SectionTitle, Segmented, Skeleton } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { PriceChart } from '@/components/wallet/PriceChart';
import { ActivityRow } from '@/components/wallet/ActivityRow';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '24H' },
  { value: '1W', label: '7D' },
  { value: '1M', label: '1M' },
  { value: '1Y', label: '1Y' },
];

function ActionButton({ icon: Icon, label, to }: { icon: typeof ArrowUpRight; label: string; to: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-2">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.05] transition-all group-hover:-translate-y-0.5 group-hover:border-white/15 group-hover:bg-white/[0.09] sm:h-[60px] sm:w-[60px]">
        <Icon className="h-[22px] w-[22px] text-accent" />
      </span>
      <span className="text-[13px] font-medium text-mist-300 group-hover:text-mist-100">{label}</span>
    </Link>
  );
}

function PortfolioCard() {
  const p = usePortfolio();
  const { fmt } = useFiat();
  const { config } = useNetwork();
  const ext = useExternalAssets();
  const hide = useSettings((s) => s.hideBalances);
  const update = useSettings((s) => s.update);
  const [range, setRange] = useState<ChartRange>('1D');
  const chart = usePortfolioChart(p.assets, range, p.showValues && !!p.totalUsd);
  // Portfolio total = Solana value + all external-chain values (BTC/ETH/LTC/DOGE).
  const grandTotal = p.showValues ? (p.totalUsd ?? 0) + ext.totalUsd : undefined;
  const up = (chart.changeUsd ?? 0) >= 0;

  return (
    <Card className="relative overflow-hidden p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl accent-gradient" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-mist-400">
            Portfolio
            {config.isTestnet && p.showValues && <Badge tone="warn">Reference value</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => p.refetch()} className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label="Refresh balances">
              <RefreshCw className={cn('h-4 w-4', p.isFetching && 'animate-spin')} />
            </button>
            <button onClick={() => update({ hideBalances: !hide })} className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label={hide ? 'Show balances' : 'Hide balances'}>
              {hide ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {p.isLoading ? (
          <div className="mt-3 space-y-3">
            <Skeleton className="h-12 w-56" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : p.error ? (
          <div className="mt-4">
            <ErrorState error={new Error(friendlyError(p.error))} onRetry={p.refetch} title="Couldn't load balances" />
          </div>
        ) : (
          <>
            <p className="num mt-2 text-[44px] font-bold leading-none sm:text-[56px]" data-testid="portfolio-total">
              {p.showValues ? fmt(grandTotal) : hide ? '••••••' : `${formatAmount(Number(p.lamports ?? 0n) / 1e9)} SOL`}
            </p>
            <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2 text-sm">
              {p.showValues && chart.changeUsd != null ? (
                <>
                  <span className={cn('num font-semibold', up ? 'text-up' : 'text-down')}>
                    {hide ? '••••' : `${up ? '+' : '-'}${fmt(Math.abs(chart.changeUsd), { ignoreHide: true }).replace('-', '')}`}
                  </span>
                  <Badge tone={up ? 'up' : 'down'}>{formatPct(chart.changePct)}</Badge>
                  <span className="text-mist-400">{RANGES.find((r) => r.value === range)?.label}</span>
                </>
              ) : !p.showValues ? (
                <span className="text-mist-400">{config.isTestnet ? 'Test tokens have no market value' : 'Market data disabled in Privacy settings'}</span>
              ) : null}
            </div>
          </>
        )}

        {p.showValues && !p.error && !p.isLoading && !p.totalUsd && (
          <div className="mt-5 flex h-[170px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.08] text-center text-sm text-mist-400">
            <LineChart className="h-6 w-6" />
            Your portfolio chart appears once you hold assets.
          </div>
        )}
        {p.showValues && !p.error && (p.isLoading || !!p.totalUsd) && (
          <div className="mt-5">
            <PriceChart data={chart.points} loading={chart.isLoading || p.isLoading} error={chart.error ? 'Price history unavailable right now' : undefined} format={(v) => fmt(v)} height={170} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <Segmented size="sm" value={range} onChange={setRange} options={RANGES} />
              <span className="hidden text-[11px] text-mist-400 sm:block">Estimated from current holdings</span>
            </div>
          </div>
        )}

        <div className="mt-7 grid grid-cols-4 gap-2 sm:max-w-sm">
          <ActionButton icon={ArrowUpRight} label="Send" to="/send" />
          <ActionButton icon={ArrowDownLeft} label="Receive" to="/receive" />
          <ActionButton icon={CreditCard} label="Buy" to="/buy" />
          <ActionButton icon={ArrowLeftRight} label="Swap" to="/swap" />
        </div>
      </div>
    </Card>
  );
}

function FaucetCard() {
  const { config, conn, network } = useNetwork();
  const account = useActiveAccount();
  const qc = useQueryClient();
  const { copy } = useClipboard();
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  if (!config.isTestnet || !account) return null;
  const run = async () => {
    setBusy(true);
    try {
      await requestAirdrop(conn, account.publicKey, 1);
      toast.success(`1 test SOL received on ${config.short}`);
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      const msg = friendlyError(e);
      if (/faucet/i.test(msg)) setClosed(true);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#a78bfa]/15 text-[#c4b5fd]">
          <Droplets className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-semibold">Need test SOL?</p>
          <p className="text-sm text-mist-400">Get free {network} SOL from the official Solana faucet.</p>
        </div>
        <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
          <Button size="sm" variant="ghost" onClick={run} loading={busy} data-testid="airdrop" title="Request via your RPC endpoint">
            RPC airdrop
          </Button>
          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => copy(account.publicKey, { label: 'Address copied — paste it into the faucet' })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm font-medium hover:bg-white/[0.1]"
          >
            Open faucet <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      {closed && (
        <p className="mt-3 text-xs text-mist-400">
          The public RPC faucet is closed on {config.short}. Use the web faucet (your address is copied when you open it), or a custom RPC with a faucet in Settings → Network.
        </p>
      )}
    </Card>
  );
}

function TokenRow({ a }: { a: Asset }) {
  const { fmt } = useFiat();
  const hide = useSettings((s) => s.hideBalances);
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/explore/${a.mint}`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]">
      <TokenIcon symbol={a.symbol} icon={a.icon} mint={a.mint} isNative={a.isNative} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
          {a.name}
          {!a.verified && <Badge tone="warn">Unverified</Badge>}
        </p>
        <p className="text-[13px] text-mist-400">
          {hide ? '••••' : formatAmount(a.uiAmount)} {a.symbol}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-[15px] font-semibold">{a.valueUsd != null ? fmt(a.valueUsd) : <span className="text-mist-400">—</span>}</p>
        {a.change24h != null && <p className={cn('text-[12px] font-medium', a.change24h >= 0 ? 'text-up' : 'text-down')}>{formatPct(a.change24h)}</p>}
      </div>
    </button>
  );
}

function ExternalAssetRow({ a }: { a: import('@/hooks/useExternalChain').ExternalAsset }) {
  const { fmt } = useFiat();
  const hide = useSettings((s) => s.hideBalances);
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/receive?coin=${a.chain.id}`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]">
      <TokenIcon symbol={a.chain.symbol} mint={a.chain.id} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{a.chain.name}</p>
        <p className="text-[13px] text-mist-400">
          {a.isLoading ? '…' : hide ? '••••' : formatAmount(a.uiAmount)} {a.chain.symbol}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-[15px] font-semibold">{a.valueUsd != null ? fmt(a.valueUsd) : <span className="text-mist-400">—</span>}</p>
      </div>
    </button>
  );
}

function Holdings() {
  const p = usePortfolio();
  const { config } = useNetwork();
  const ext = useExternalAssets();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? p.assets.filter((a) => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.mint.toLowerCase() === s) : p.assets;
  }, [p.assets, q]);
  const extList = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ext.assets.filter((a) => a.chain.symbol.toLowerCase().includes(s) || a.chain.name.toLowerCase().includes(s)) : ext.assets;
  }, [ext.assets, q]);

  return (
    <Card className="p-3 sm:p-4">
      <div className="px-2 pt-1">
        <SectionTitle action={<span className="text-xs text-mist-400">{p.assets.length + ext.assets.length} assets</span>}>Assets</SectionTitle>
        {p.tokensPartial && !config.isTestnet && (
          <Notice className="mb-2">
            SOL is loaded. The free public RPC can’t list SPL tokens — add a free RPC URL (e.g. Helius) in{' '}
            <Link to="/settings/network" className="font-semibold text-accent hover:underline">Settings → Network</Link> to see your tokens.
          </Notice>
        )}
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets" aria-label="Search assets" className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-sm outline-none focus:border-[var(--accent-from)]" />
        </div>
      </div>
      {p.isLoading ? (
        <div className="space-y-2 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {list.map((a) => (
            <TokenRow key={a.key} a={a} />
          ))}
          {extList.length > 0 && (
            <>
              {!q && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-mist-400">Other networks</p>}
              {extList.map((a) => (
                <ExternalAssetRow key={a.chain.id} a={a} />
              ))}
            </>
          )}
          {list.length === 0 && extList.length === 0 && (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title={q ? 'No matching assets' : 'No assets yet'} body={q ? 'Try a different search.' : 'Receive crypto to get started.'} />
          )}
        </div>
      )}
      {p.assets.some((a) => !a.verified) && (
        <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-mist-400">“Unverified” means Nocta could not verify the token’s identity. Unknown tokens sent to you can be scams — never interact with links in token names.</p>
      )}
    </Card>
  );
}

function RecentActivity() {
  const h = useHistory(10);
  const items = h.data?.pages[0]?.items.slice(0, 6) ?? [];
  const mints = items.flatMap((a) => a.changes.map((c) => c.mint));
  const info = useTokenInfo(mints);
  const hide = useSettings((s) => s.hideBalances);
  return (
    <Card className="p-3 sm:p-4">
      <div className="px-2 pt-1">
        <SectionTitle action={<Link to="/activity" className="text-xs font-semibold text-accent hover:underline">View all</Link>}>Recent activity</SectionTitle>
      </div>
      {h.isLoading ? (
        <div className="space-y-3 p-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : h.error ? (
        <div className="p-2">
          <ErrorState error={new Error(friendlyError(h.error))} onRetry={() => h.refetch()} title="Couldn't load activity" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="No activity yet" body="Transactions on this network will appear here." />
      ) : (
        items.map((a) => <ActivityRow key={a.signature} a={a} info={info.data} hideAmounts={hide} />)
      )}
    </Card>
  );
}

export function Dashboard() {
  const { pricesError, showValues } = usePortfolio();
  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-5">
        <PortfolioCard />
        {pricesError && showValues && <Notice tone="warn">Live prices are temporarily unavailable. Balances are still accurate.</Notice>}
        <FaucetCard />
        <RecentActivity />
      </div>
      <div className="space-y-5">
        <Holdings />
      </div>
    </div>
  );
}
