import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Copy, ExternalLink, Globe, ShieldAlert } from 'lucide-react';
import { getTokensByMint } from '@/lib/api/jupiter';
import type { ChartRange } from '@/lib/api/coingecko';
import { NATIVE_MINT } from '@/lib/solana/balances';
import { explorerAddressUrl } from '@/lib/solana/networks';
import { formatAmount, formatCompact, formatPct, shortAddress } from '@/lib/format';
import { useTokenHistory } from '@/hooks/useCharts';
import { useFiat } from '@/hooks/useFiat';
import { useNetwork } from '@/hooks/useNetwork';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useClipboard } from '@/hooks/useClipboard';
import { useSettings } from '@/state/settings';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, cn, ErrorState, Notice, Row, SectionTitle, Segmented, Skeleton } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { PriceChart } from '@/components/wallet/PriceChart';
import { VerifyBadge } from '@/components/wallet/VerifyBadge';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '24H' },
  { value: '1W', label: '7D' },
  { value: '1M', label: '1M' },
  { value: '1Y', label: '1Y' },
];

interface MintAccount {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

function safeUrl(u?: string) {
  try {
    if (!u) return undefined;
    const url = new URL(u);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function TokenDetail() {
  const { mint = '' } = useParams();
  const navigate = useNavigate();
  const { conn, network, config } = useNetwork();
  const { fmt, convert, currency } = useFiat();
  const { copy } = useClipboard();
  const hide = useSettings((s) => s.hideBalances);
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const portfolio = usePortfolio();
  const [range, setRange] = useState<ChartRange>('1W');

  let validMint = true;
  try {
    new PublicKey(mint);
  } catch {
    validMint = false;
  }
  const isSol = mint === NATIVE_MINT;

  const meta = useQuery({
    queryKey: ['token-detail', mint],
    queryFn: async () => (await getTokensByMint([mint]))[mint] ?? null,
    enabled: validMint && fetchMarketData,
    staleTime: 60_000,
  });
  const onchain = useQuery({
    queryKey: ['mint-account', network, mint],
    queryFn: async (): Promise<MintAccount | null> => {
      const info = await conn.getParsedAccountInfo(new PublicKey(mint));
      const data = info.value?.data as { parsed?: { type: string; info: MintAccount } } | undefined;
      return data?.parsed?.type === 'mint' ? data.parsed.info : null;
    },
    enabled: validMint && !isSol,
    staleTime: 60_000,
  });
  const chart = useTokenHistory(validMint && fetchMarketData ? mint : undefined, range);
  const holding = portfolio.assets.find((a) => (isSol ? a.isNative : a.mint === mint));

  if (!validMint) return <ErrorState error={new Error('That is not a valid token address.')} />;

  const t = meta.data;
  const name = isSol ? 'Solana' : t?.name ?? holding?.name ?? 'Unknown token';
  const symbol = isSol ? 'SOL' : t?.symbol ?? holding?.symbol ?? '???';
  const verified = isSol || !!t?.isVerified;
  const price = t?.usdPrice;
  const change = t?.stats24h?.priceChange;
  const mintAuth = onchain.data ? onchain.data.mintAuthority : t?.mintAuthority ?? (t?.audit?.mintAuthorityDisabled ? null : undefined);
  const freezeAuth = onchain.data ? onchain.data.freezeAuthority : t?.freezeAuthority ?? (t?.audit?.freezeAuthorityDisabled ? null : undefined);
  const website = safeUrl(t?.website);

  return (
    <div>
      <PageHeader title={name} back="/explore" />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <TokenIcon symbol={symbol} icon={t?.icon ?? holding?.icon} mint={mint} isNative={isSol} size={56} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold">{symbol}</span>
                  <VerifyBadge verified={verified} source={isSol ? 'Solana (native asset)' : 'Jupiter'} />
                  {t?.tags?.includes('stable') && <Badge>Stablecoin</Badge>}
                </div>
                {meta.isLoading ? (
                  <Skeleton className="mt-2 h-8 w-36" />
                ) : (
                  <p className="num mt-1 text-3xl font-bold">
                    {price != null ? fmt(price, { ignoreHide: true }) : '—'}{' '}
                    {change != null && <span className={cn('text-base font-semibold', change >= 0 ? 'text-up' : 'text-down')}>{formatPct(change)}</span>}
                  </p>
                )}
              </div>
            </div>
            {fetchMarketData && (
              <div className="mt-5">
                <PriceChart data={chart.data?.map(([t, v]) => ({ t, v }))} loading={chart.isLoading} error={chart.isError ? 'No price history available for this token' : undefined} format={(v) => fmt(v, { ignoreHide: true })} height={200} />
                <Segmented className="mt-3" size="sm" value={range} onChange={setRange} options={RANGES} />
              </div>
            )}
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Button disabled={!holding || holding.amount === 0n} onClick={() => navigate(`/send?mint=${isSol ? 'SOL' : mint}`)}>
                <ArrowUpRight className="h-4 w-4" /> Send
              </Button>
              <Button onClick={() => navigate('/receive')}>
                <ArrowDownLeft className="h-4 w-4" /> Receive
              </Button>
              <Button onClick={() => navigate('/swap')} disabled={!config.hasMarketData}>
                <ArrowLeftRight className="h-4 w-4" /> Swap
              </Button>
            </div>
          </Card>

          {!verified && (
            <Notice tone="warn" title="Token information could not be verified">
              Anyone can create a token with any name, symbol or logo. Confirm the mint address with an official source before buying or interacting.
            </Notice>
          )}
          {t?.audit?.isSus && <Notice tone="danger" title="Flagged as suspicious">Jupiter’s audit data flags this token as suspicious.</Notice>}
          {!isSol && mintAuth && <Notice tone="warn">Mint authority is enabled — the issuer can create more supply at any time.</Notice>}
          {!isSol && freezeAuth && <Notice tone="warn">Freeze authority is enabled — the issuer can freeze holders’ token accounts.</Notice>}

          {meta.isError && <ErrorState error={meta.error} onRetry={() => meta.refetch()} title="Market data unavailable" />}
          {!meta.isLoading && !t && !isSol && fetchMarketData && !meta.isError && <Notice>No market listing found for this mint. Data shown is from the blockchain only.</Notice>}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Your holdings</SectionTitle>
            {portfolio.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : holding ? (
              <div className="flex items-end justify-between">
                <p className="num text-2xl font-bold">
                  {hide ? '••••' : formatAmount(holding.uiAmount)} <span className="text-base text-mist-400">{symbol}</span>
                </p>
                <p className="text-sm text-mist-300">{holding.valueUsd != null ? fmt(holding.valueUsd) : ''}</p>
              </div>
            ) : (
              <p className="text-sm text-mist-400">You don’t hold this token on {config.short}.</p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Market</SectionTitle>
            <div className="divide-y divide-white/[0.05]">
              <Row label="Market cap">{t?.mcap ? formatCompact(convert(t.mcap), currency) : '—'}</Row>
              <Row label="FDV">{t?.fdv ? formatCompact(convert(t.fdv), currency) : '—'}</Row>
              <Row label="Liquidity">{t?.liquidity ? formatCompact(convert(t.liquidity), currency) : '—'}</Row>
              <Row label="24h volume">{t?.stats24h ? formatCompact(convert((t.stats24h.buyVolume ?? 0) + (t.stats24h.sellVolume ?? 0)), currency) : '—'}</Row>
              <Row label="Holders">{t?.holderCount ? t.holderCount.toLocaleString() : '—'}</Row>
              <Row label="Circulating supply">{t?.circSupply ? formatCompact(t.circSupply) : '—'}</Row>
              {t?.audit?.topHoldersPercentage != null && <Row label="Top 10 holders">{t.audit.topHoldersPercentage.toFixed(1)}%</Row>}
            </div>
            {config.isTestnet && <p className="mt-2 text-[11px] text-mist-400">Market data reflects Solana Mainnet.</p>}
          </Card>

          <Card className="p-5">
            <SectionTitle>Token details</SectionTitle>
            <div className="divide-y divide-white/[0.05]">
              <Row label={isSol ? 'Wrapped mint' : 'Mint address'}>
                <button onClick={() => copy(mint, { label: 'Mint address' })} className="inline-flex items-center gap-1.5 font-mono text-[13px] hover:text-accent">
                  {shortAddress(mint, 6)} <Copy className="h-3.5 w-3.5" />
                </button>
              </Row>
              <Row label="Decimals">{onchain.data?.decimals ?? t?.decimals ?? (isSol ? 9 : '—')}</Row>
              {!isSol && <Row label="Token program">{t?.tokenProgram === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' ? 'Token-2022' : t?.tokenProgram ? 'SPL Token' : '—'}</Row>}
              {!isSol && <Row label="Mint authority">{mintAuth ? <span className="text-warn">Enabled</span> : mintAuth === null ? <span className="text-up">Disabled</span> : '—'}</Row>}
              {!isSol && <Row label="Freeze authority">{freezeAuth ? <span className="text-warn">Enabled</span> : freezeAuth === null ? <span className="text-up">Disabled</span> : '—'}</Row>}
              <Row label="On-chain status">{isSol ? 'Native asset' : onchain.isLoading ? '…' : onchain.data ? `Exists on ${config.short}` : <span className="text-mist-400">Not found on {config.short}</span>}</Row>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={explorerAddressUrl(network, mint)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.09]">
                <ExternalLink className="h-3.5 w-3.5" /> Explorer
              </a>
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.09]">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
            </div>
            {!verified && (
              <p className="mt-3 flex items-start gap-2 text-[11px] text-mist-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> External links for unverified tokens may be malicious.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
