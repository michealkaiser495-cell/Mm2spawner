import { describe, expect, it } from 'vitest';
import { decodeUint256, encodeBalanceOf, evmTokensFor, allEvmTokenCoingeckoIds } from './evmTokens';
import { erc20TransferData } from './evmSend';

const ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('ERC-20 helpers', () => {
  it('encodes balanceOf calldata (selector + 32-byte padded owner)', () => {
    const data = encodeBalanceOf(ADDR);
    expect(data.startsWith('0x70a08231')).toBe(true);
    expect(data.length).toBe(10 + 64); // selector + one word
    expect(data.endsWith('9858effd232b4033e47d90003d41ec34ecaeda94')).toBe(true);
  });

  it('decodes a uint256 word and handles empty', () => {
    expect(decodeUint256('0x' + 'f4240'.padStart(64, '0'))).toBe(1_000_000n);
    expect(decodeUint256('0x')).toBe(0n);
    expect(decodeUint256('')).toBe(0n);
  });

  it('builds a valid ERC-20 transfer calldata (a9059cbb + to + amount)', () => {
    const data = erc20TransferData(ADDR, 1_000_000n);
    expect(data.startsWith('0xa9059cbb')).toBe(true);
    expect(data.toLowerCase()).toContain('9858effd232b4033e47d90003d41ec34ecaeda94');
    expect(data.toLowerCase().endsWith('f4240')).toBe(true);
    expect(data.length).toBe(10 + 128); // selector + two 32-byte words
  });

  it('lists USDT/USDC per chain and dedups coingecko ids', () => {
    expect(evmTokensFor('ethereum').map((t) => t.symbol)).toEqual(['USDT', 'USDC']);
    expect(evmTokensFor('base').map((t) => t.symbol)).toEqual(['USDC']);
    expect(evmTokensFor('solana')).toEqual([]);
    expect(allEvmTokenCoingeckoIds().sort()).toEqual(['tether', 'usd-coin']);
  });
});
