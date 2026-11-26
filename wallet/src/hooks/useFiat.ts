import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFiatRates } from '@/lib/api/coingecko';
import { formatFiat } from '@/lib/format';
import { useSettings } from '@/state/settings';

/** Converts USD values into the user's display currency. Falls back to USD if rates are unavailable. */
export function useFiat() {
  const currency = useSettings((s) => s.currency);
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const hide = useSettings((s) => s.hideBalances);
  const rates = useQuery({
    queryKey: ['fiat-rates'],
    queryFn: getFiatRates,
    enabled: currency !== 'usd' && fetchMarketData,
    staleTime: 60 * 60_000,
  });
  const effective = currency !== 'usd' && rates.data?.[currency] ? currency : 'usd';
  const rate = effective === 'usd' ? 1 : rates.data![currency];

  const convert = useCallback((usd: number | undefined | null) => (usd == null ? undefined : usd * rate), [rate]);
  const fmt = useCallback(
    (usd: number | undefined | null, opts?: { ignoreHide?: boolean }) =>
      hide && !opts?.ignoreHide ? '••••••' : formatFiat(usd == null ? undefined : usd * rate, effective),
    [rate, effective, hide],
  );
  return { currency: effective, requested: currency, rate, convert, fmt, ratesError: rates.isError };
}
