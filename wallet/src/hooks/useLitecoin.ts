import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLtcAccount, fetchLtcPrice } from '@/lib/api/litecoin';
import type { LtcAddressType } from '@/lib/crypto/litecoin';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { useSettings } from '@/state/settings';

/** Litecoin receive address for the active account (recovery-phrase keyrings only). */
export function useLitecoinAddress(type: LtcAddressType = 'segwit') {
  const account = useActiveAccount();
  const status = useWallet((s) => s.status);
  const getAddr = useWallet((s) => s.getLitecoinAddress);
  // Re-derive when the account, type, or unlock state changes.
  return useMemo(() => {
    if (status !== 'unlocked' || !account) return null;
    try {
      return getAddr(account.id, type);
    } catch {
      return null;
    }
  }, [account, status, type, getAddr]);
}

export function useLitecoinAccount(address: string | null) {
  return useQuery({
    queryKey: ['ltc-account', address],
    queryFn: () => fetchLtcAccount(address!),
    enabled: !!address,
    refetchInterval: 45_000,
    retry: 1,
  });
}

export function useLitecoinPrice() {
  const currency = useSettings((s) => s.currency);
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  return useQuery({
    queryKey: ['ltc-price', currency],
    queryFn: () => fetchLtcPrice('usd'),
    enabled: fetchMarketData,
    staleTime: 60_000,
    retry: 1,
  });
}
