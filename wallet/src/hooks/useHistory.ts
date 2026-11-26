import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchActivity, fetchHistory } from '@/lib/solana/history';
import { useActiveAccount } from '@/state/wallet';
import { useNetwork } from './useNetwork';

export function useHistory(pageSize = 20) {
  const account = useActiveAccount();
  const { conn, network, rpcUrl } = useNetwork();
  return useInfiniteQuery({
    queryKey: ['history', network, rpcUrl, account?.publicKey, pageSize],
    queryFn: ({ pageParam }) => fetchHistory(conn, account!.publicKey, { before: pageParam, limit: pageSize }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore,
    enabled: !!account,
    refetchInterval: 45_000,
    retry: 1,
  });
}

export function useActivity(signature: string | undefined) {
  const account = useActiveAccount();
  const { conn, network } = useNetwork();
  return useQuery({
    queryKey: ['activity', network, signature, account?.publicKey],
    queryFn: () => fetchActivity(conn, signature!, account!.publicKey),
    enabled: !!signature && !!account,
    retry: 1,
  });
}
