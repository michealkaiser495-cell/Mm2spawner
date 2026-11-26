import { useQuery } from '@tanstack/react-query';
import { getTokensByMint, NATIVE_SOL_INFO, type JupToken } from '@/lib/api/jupiter';
import { useSettings } from '@/state/settings';
import { useNetwork } from './useNetwork';

/**
 * Metadata for arbitrary mints (history rows, swap selector). Registry data describes
 * mainnet mints, so on testnets only native SOL is resolved.
 */
export function useTokenInfo(mints: string[]) {
  const { config } = useNetwork();
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const sorted = [...new Set(mints)].filter((m) => m !== 'SOL').sort();
  const q = useQuery({
    queryKey: ['token-info', sorted],
    queryFn: () => getTokensByMint(sorted),
    enabled: sorted.length > 0 && config.hasMarketData && fetchMarketData,
    staleTime: 10 * 60_000,
  });
  const data: Record<string, JupToken> = { ...(config.hasMarketData ? q.data : {}), SOL: NATIVE_SOL_INFO };
  return { ...q, data };
}
