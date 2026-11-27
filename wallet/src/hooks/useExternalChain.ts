import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchExternalAccount, fetchSimplePrices } from '@/lib/api/external';
import type { ExternalChain } from '@/lib/chains/external';
import { EXTERNAL_CHAINS } from '@/lib/chains/external';
import { allEvmTokenCoingeckoIds, type EvmToken } from '@/lib/chains/evmTokens';
import { toNumber } from '@/lib/format';
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
    queryFn: () => fetchSimplePrices([...EXTERNAL_CHAINS.map((c) => c.coingeckoId), ...allEvmTokenCoingeckoIds()]),
    enabled: fetchMarketData,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useExternalVariant(chain: ExternalChain) {
  return useState<string | undefined>(chain.variants?.[0]?.id);
}

// ---------------------------------------------------------------- all external assets (dashboard)


export interface ExternalAsset {
  chain: ExternalChain;
  token?: EvmToken; // set for an ERC-20 row (USDT/USDC); absent for the native coin
  symbol: string;
  name: string;
  decimals: number;
  address: string | null;
  uiAmount: number;
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
  isLoading: boolean;
  isError: boolean;
}

/** Live balances for every external chain (BTC, ETH, LTC, DOGE, …) for the active account. */
export function useExternalAssets(): { assets: ExternalAsset[]; totalUsd: number } {
  const account = useActiveAccount();
  const status = useWallet((s) => s.status);
  const getAddr = useWallet((s) => s.getExternalAddress);
  const prices = useExternalPrices();

  const addresses = useMemo(
    () =>
      EXTERNAL_CHAINS.map((c) => {
        if (status !== 'unlocked' || !account) return null;
        try {
          return getAddr(account.id, c.id);
        } catch {
          return null;
        }
      }),
    [account, status, getAddr],
  );

  const results = useQueries({
    queries: EXTERNAL_CHAINS.map((c, i) => ({
      queryKey: ['external-account', c.id, addresses[i]],
      queryFn: () => fetchExternalAccount(c.id, addresses[i]!),
      enabled: !!addresses[i],
      refetchInterval: 60_000,
      retry: 1,
    })),
  });

  const assets = EXTERNAL_CHAINS.flatMap<ExternalAsset>((c, i) => {
    const r = results[i];
    const data = r.data;
    const uiAmount = data ? toNumber(data.balance + data.unconfirmed, c.decimals) : 0;
    const priceUsd = prices.data?.[c.coingeckoId];
    const native: ExternalAsset = {
      chain: c,
      symbol: c.symbol,
      name: c.name,
      decimals: c.decimals,
      address: addresses[i],
      uiAmount,
      priceUsd,
      valueUsd: priceUsd != null ? uiAmount * priceUsd : undefined,
      isLoading: r.isLoading,
      isError: r.isError,
    };
    // ERC-20 token rows (USDT/USDC) with a non-zero balance for this chain.
    const tokenRows: ExternalAsset[] = (data?.tokens ?? [])
      .filter((t) => t.balance > 0n)
      .map((t) => {
        const ui = toNumber(t.balance, t.token.decimals);
        const tp = prices.data?.[t.token.coingeckoId];
        return {
          chain: c,
          token: t.token,
          symbol: t.token.symbol,
          name: `${t.token.name} (${c.name})`,
          decimals: t.token.decimals,
          address: addresses[i],
          uiAmount: ui,
          priceUsd: tp,
          valueUsd: tp != null ? ui * tp : undefined,
          isLoading: r.isLoading,
          isError: r.isError,
        };
      });
    return [native, ...tokenRows];
  });
  const totalUsd = assets.reduce((s, a) => s + (a.valueUsd ?? 0), 0);
  return { assets, totalUsd };
}
