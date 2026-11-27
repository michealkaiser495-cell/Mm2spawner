import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { getTokenMetadata, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { fetchPortfolio, NATIVE_MINT, type TokenHolding } from '@/lib/solana/balances';
import { getPrices, getTokensByMint, type JupToken } from '@/lib/api/jupiter';
import { toNumber } from '@/lib/format';
import { useActiveAccount } from '@/state/wallet';
import { useSettings } from '@/state/settings';
import { useNetwork } from './useNetwork';

export interface Asset {
  key: string; // 'SOL' or mint
  mint: string;
  isNative: boolean;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  amount: bigint;
  uiAmount: number;
  priceUsd?: number;
  change24h?: number;
  valueUsd?: number;
  verified: boolean;
  metadataSource: 'native' | 'jupiter' | 'onchain' | 'none';
  /** true when value uses mainnet reference prices on a testnet */
  referencePrice: boolean;
  holding?: TokenHolding;
  meta?: JupToken;
}

export function usePortfolioQuery() {
  const account = useActiveAccount();
  const { conn, network, rpcUrl } = useNetwork();
  return useQuery({
    queryKey: ['portfolio', network, rpcUrl, account?.publicKey],
    queryFn: () => fetchPortfolio(conn, account!.publicKey),
    enabled: !!account,
    refetchInterval: 12_000,
    refetchOnMount: 'always',
    // Public RPCs rate-limit aggressively; back off and retry before surfacing an error.
    retry: (n, err) => n < (/429|too many/i.test(String((err as Error)?.message)) ? 4 : 1),
    retryDelay: (n) => Math.min(800 * 2 ** n, 8000),
  });
}

/** Full portfolio with metadata + prices, sorted by value. */
export function usePortfolio() {
  const { config, conn, network } = useNetwork();
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const testnetRef = useSettings((s) => s.testnetReferenceValues);
  const hideZero = useSettings((s) => s.hideZeroBalances);
  const hideUnverified = useSettings((s) => s.hideUnverified);
  const chain = usePortfolioQuery();
  const mints = useMemo(() => chain.data?.tokens.map((t) => t.mint).sort() ?? [], [chain.data]);

  const metadata = useQuery({
    queryKey: ['token-meta', network, mints],
    queryFn: async () => {
      // Mainnet: Jupiter token registry. Testnets: on-chain Token-2022 metadata only (registries describe mainnet mints).
      const out: Record<string, { name: string; symbol: string; icon?: string; source: 'jupiter' | 'onchain'; meta?: JupToken }> = {};
      if (config.hasMarketData && fetchMarketData) {
        const j = await getTokensByMint(mints);
        for (const [m, t] of Object.entries(j)) out[m] = { name: t.name, symbol: t.symbol, icon: t.icon, source: 'jupiter', meta: t };
      }
      const t22 = chain.data!.tokens.filter((t) => t.programId === TOKEN_2022_PROGRAM_ID.toBase58() && !out[t.mint]);
      await Promise.all(
        t22.map(async (t) => {
          try {
            const md = await getTokenMetadata(conn, new PublicKey(t.mint), 'confirmed', TOKEN_2022_PROGRAM_ID);
            if (md) out[t.mint] = { name: md.name.slice(0, 40), symbol: md.symbol.slice(0, 12), source: 'onchain' };
          } catch {
            /* no metadata extension */
          }
        }),
      );
      return out;
    },
    enabled: !!chain.data && mints.length > 0,
    staleTime: 10 * 60_000,
  });

  const prices = useQuery({
    queryKey: ['prices', network, mints],
    queryFn: () => getPrices(config.hasMarketData ? [NATIVE_MINT, ...mints] : [NATIVE_MINT]),
    enabled: fetchMarketData && !!chain.data && (config.hasMarketData || testnetRef),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const assets = useMemo<Asset[]>(() => {
    if (!chain.data) return [];
    const p = prices.data ?? {};
    const sol = p[NATIVE_MINT];
    const solUi = toNumber(chain.data.lamports, 9);
    const list: Asset[] = [
      {
        key: 'SOL',
        mint: NATIVE_MINT,
        isNative: true,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        amount: chain.data.lamports,
        uiAmount: solUi,
        priceUsd: sol?.usdPrice,
        change24h: sol?.priceChange24h,
        valueUsd: sol ? sol.usdPrice * solUi : undefined,
        verified: true,
        metadataSource: 'native',
        referencePrice: config.isTestnet,
      },
    ];
    for (const t of chain.data.tokens) {
      const md = metadata.data?.[t.mint];
      const price = config.hasMarketData ? p[t.mint] : undefined;
      const ui = toNumber(t.amount, t.decimals);
      list.push({
        key: t.mint,
        mint: t.mint,
        isNative: false,
        symbol: md?.symbol || 'Unknown',
        name: md?.name || 'Unknown token',
        icon: md?.icon,
        decimals: t.decimals,
        amount: t.amount,
        uiAmount: ui,
        priceUsd: price?.usdPrice,
        change24h: price?.priceChange24h,
        valueUsd: price ? price.usdPrice * ui : undefined,
        verified: md?.source === 'jupiter' && !!md.meta?.isVerified,
        metadataSource: md?.source ?? 'none',
        referencePrice: false,
        holding: t,
        meta: md?.meta,
      });
    }
    return list
      .filter((a) => a.isNative || ((!hideZero || a.amount > 0n) && (!hideUnverified || a.verified)))
      .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || b.uiAmount - a.uiAmount);
  }, [chain.data, metadata.data, prices.data, config, hideZero, hideUnverified]);

  const showValues = fetchMarketData && (!config.isTestnet || testnetRef);
  const totalUsd = showValues ? assets.reduce((s, a) => s + (a.valueUsd ?? 0), 0) : undefined;
  const change24hUsd = showValues
    ? assets.reduce((s, a) => (a.valueUsd && a.change24h != null ? s + a.valueUsd - a.valueUsd / (1 + a.change24h / 100) : s), 0)
    : undefined;

  return {
    assets,
    totalUsd,
    change24hUsd,
    showValues,
    lamports: chain.data?.lamports,
    tokensPartial: chain.data?.tokensPartial ?? false,
    isLoading: chain.isLoading,
    isFetching: chain.isFetching || prices.isFetching,
    error: chain.error,
    pricesError: prices.error,
    refetch: () => {
      chain.refetch();
      prices.refetch();
    },
  };
}
