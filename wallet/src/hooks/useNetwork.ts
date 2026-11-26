import { useMemo } from 'react';
import { getConnection, NETWORKS } from '@/lib/solana/networks';
import { rpcUrlFor, useSettings } from '@/state/settings';

export function useNetwork() {
  const network = useSettings((s) => s.network);
  const rpc = useSettings((s) => s.rpc);
  const config = NETWORKS[network];
  const rpcUrl = rpcUrlFor({ rpc }, network, config.defaultRpc);
  const conn = useMemo(() => getConnection(rpcUrl), [rpcUrl]);
  return { network, config, rpcUrl, conn, isCustomRpc: rpcUrl !== config.defaultRpc };
}
