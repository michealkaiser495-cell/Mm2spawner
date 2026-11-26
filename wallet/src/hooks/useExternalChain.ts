import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchExternalAccount, fetchSimplePrices } from '@/lib/api/external';
import type { ExternalChain } from '@/lib/chains/external';
import { EXTERNAL_CHAINS } from '@/lib/chains/external';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { useSettings } from '@/state/settings';

/** Derived receive address for an external chain + optional UTXO variant. */
export function useExternalAddress(chain: ExternalChain, variant?: string) {
  const account = useActiveAccount();
  const status = useWallet((s) => s.status);
  const getAddr = useWallet((s) => s.getExternalAddress);
  return useMemo(() => {
    if (status !== 'unlocked' || !account) return null;
    try {
      return getAddr(account.id, chain.id, variant);
    } catch {
      return null;
    }
  }, [account, status, chain.id, variant, getAddr]);
}

export function useExternalAccount(chain: ExternalChain, address: string | null) {
  return useQuery({
    queryKey: ['external-account', chain.id, address],
    queryFn: () => fetchExternalAccount(chain.id, address!),
    enabled: !!address,
    refetchInterval: 60_000,
    retry: 1,
  });
}

/** Prices for every external chain's native coin (USD), batched. */
export function useExternalPrices() {
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  return useQuery({
    queryKey: ['external-prices'],
    queryFn: () => fetchSimplePrices(EXTERNAL_CHAINS.map((c) => c.coingeckoId)),
    enabled: fetchMarketData,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useExternalVariant(chain: ExternalChain) {
  return useState<string | undefined>(chain.variants?.[0]?.id);
}
