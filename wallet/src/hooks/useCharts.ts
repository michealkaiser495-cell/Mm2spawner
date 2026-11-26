import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSolHistory, getTokenHistory, type ChartRange } from '@/lib/api/coingecko';
import { NATIVE_MINT } from '@/lib/solana/balances';
import { useSettings } from '@/state/settings';
import type { ChartPoint } from '@/components/wallet/PriceChart';
import type { Asset } from './usePortfolio';

export function useSolHistory(range: ChartRange, enabled = true) {
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  return useQuery({
    queryKey: ['sol-history', range],
    queryFn: () => getSolHistory(range),
    enabled: enabled && fetchMarketData,
    staleTime: range === '1D' ? 5 * 60_000 : 30 * 60_000,
    retry: 1,
  });
}

export function useTokenHistory(mint: string | undefined, range: ChartRange) {
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  return useQuery({
    queryKey: ['token-history', mint, range],
    queryFn: () => (mint === NATIVE_MINT ? getSolHistory(range) : getTokenHistory(mint!, range)),
    enabled: !!mint && fetchMarketData,
    staleTime: 15 * 60_000,
    retry: 0,
  });
}

/**
 * Portfolio value over time, estimated from CURRENT holdings: SOL is valued at its
 * historical price; other tokens at their current price (no per-token history). The UI
 * labels this as an estimate.
 */
export function usePortfolioChart(assets: Asset[], range: ChartRange, enabled: boolean) {
  const sol = assets.find((a) => a.isNative);
  const others = assets.filter((a) => !a.isNative).reduce((s, a) => s + (a.valueUsd ?? 0), 0);
  const hist = useSolHistory(range, enabled);
  const points = useMemo<ChartPoint[] | undefined>(() => {
    if (!hist.data || !sol) return undefined;
    const step = Math.max(1, Math.floor(hist.data.length / 160));
    const pts = hist.data.filter((_, i) => i % step === 0 || i === hist.data!.length - 1).map(([t, p]) => ({ t, v: sol.uiAmount * p + others }));
    // Anchor the final point to the live value so the chart matches the headline.
    const live = assets.reduce((s, a) => s + (a.valueUsd ?? 0), 0);
    if (pts.length && live > 0) pts.push({ t: Date.now(), v: live });
    return pts;
  }, [hist.data, sol, others, assets]);
  const first = points?.[0]?.v;
  const last = points?.[points.length - 1]?.v;
  const changeUsd = first != null && last != null ? last - first : undefined;
  const changePct = first && changeUsd != null ? (changeUsd / first) * 100 : undefined;
  return { points, changeUsd, changePct, isLoading: hist.isLoading && enabled, error: hist.error };
}
