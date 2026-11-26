/** Turn raw RPC / web3.js errors into messages a user can act on. Never includes secrets. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  const msg = raw || 'Unknown error';
  const m = msg.toLowerCase();
  if (m.includes('429') || m.includes('too many requests') || m.includes('rate limit'))
    return 'The RPC endpoint is rate-limiting requests. Wait a moment, or set a dedicated RPC URL in Settings → Network.';
  if (m.includes('403') || m.includes('forbidden'))
    return 'The RPC endpoint refused the request (403). Try a different RPC URL in Settings → Network.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed'))
    return 'Could not reach the network. Check your connection or RPC URL.';
  if (m.includes('blockhash not found') || m.includes('block height exceeded') || m.includes('has expired'))
    return 'The transaction expired before it was confirmed. It was NOT processed — it is safe to try again.';
  if (m.includes('insufficient funds for rent'))
    return 'The resulting account balance would be below the rent-exempt minimum. Send more, or leave more SOL in your account.';
  if (m.includes('attempt to debit an account but found no record of a prior credit') || m.includes('invalidaccountforfee') || m.includes('accountnotfound'))
    return 'This account has no SOL to pay network fees.';
  if (m.includes('insufficient lamports') || m.includes('insufficient funds') || m.includes('custom program error: 0x1'))
    return 'Insufficient balance to complete this transaction (including network fees).';
  if (m.includes('slippage') || m.includes('0x1771') || m.includes('6001'))
    return 'Price moved beyond your slippage tolerance. Refresh the quote or increase slippage.';
  if (m.includes('faucet is closed'))
    return 'The public RPC faucet is closed on this network. Use faucet.solana.com to get test SOL.';
  if (m.includes('airdrop') && (m.includes('limit') || m.includes('faucet')))
    return 'Devnet faucet limit reached. Try again later or use faucet.solana.com.';
  if (m.includes('user rejected')) return 'Request rejected.';
  return msg.length > 220 ? msg.slice(0, 220) + '…' : msg;
}
