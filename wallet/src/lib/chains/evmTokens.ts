/**
 * ERC-20 tokens Nocta shows and sends on each EVM chain (USDT, USDC, …). Read-only balances are
 * fetched with a raw `eth_call` to the token's `balanceOf`; sends build a standard `transfer`
 * calldata via viem (audited) in evmSend.ts. Addresses below are the canonical mainnet contracts.
 */
export interface EvmToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  coingeckoId: string;
}

export const EVM_TOKENS: Record<string, EvmToken[]> = {
  ethereum: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coingeckoId: 'usd-coin' },
  ],
  base: [
    { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, coingeckoId: 'usd-coin' },
  ],
  polygon: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, coingeckoId: 'usd-coin' },
  ],
  arbitrum: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, coingeckoId: 'usd-coin' },
  ],
};

export function evmTokensFor(chainId: string): EvmToken[] {
  return EVM_TOKENS[chainId] ?? [];
}

/** Every distinct CoinGecko id for the EVM tokens (so prices can be batched with the natives). */
export function allEvmTokenCoingeckoIds(): string[] {
  return [...new Set(Object.values(EVM_TOKENS).flat().map((t) => t.coingeckoId))];
}

const BALANCE_OF_SELECTOR = '0x70a08231';

/** ABI-encode `balanceOf(address)` calldata. */
export function encodeBalanceOf(owner: string): string {
  return BALANCE_OF_SELECTOR + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** Decode a 32-byte hex word returned by `balanceOf` into a bigint. */
export function decodeUint256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex.length > 66 ? hex.slice(0, 66) : hex);
}
