/**
 * EVM sending (Ethereum, Base, Polygon, Arbitrum). Built on viem (audited) — viem handles
 * EIP-1559 construction, signing and broadcasting; we never hand-roll transaction crypto.
 * Signing was verified against the canonical mnemonic→address vector and sender recovery.
 *
 * Fees use the network's own EIP-1559 estimate (base fee + a small priority tip), which is the
 * cheapest rate that still confirms. On L2s (Base/Arbitrum/Polygon) this is a fraction of a cent.
 */
import { createPublicClient, createWalletClient, formatEther, http, isAddress, type Chain } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { EvmChainParams } from '../crypto/evm';

function viemChain(c: EvmChainParams): Chain {
  return {
    id: c.chainId,
    name: c.name,
    nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: 18 },
    rpcUrls: { default: { http: [c.rpc] } },
  };
}

function account(mnemonic: string, index: number) {
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

export interface EvmSendQuote {
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  feeWei: bigint;
  totalWei: bigint;
  balanceWei: bigint;
  feeEth: string;
  errors: string[];
  warnings: string[];
}

export async function prepareEvmSend(params: {
  chain: EvmChainParams;
  mnemonic: string;
  index: number;
  to: string;
  amountWei: bigint;
}): Promise<EvmSendQuote> {
  const { chain, mnemonic, index, to, amountWei } = params;
  const acct = account(mnemonic, index);
  const pub = createPublicClient({ chain: viemChain(chain), transport: http() });
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isAddress(to)) errors.push('Recipient is not a valid EVM (0x…) address.');
  if (amountWei <= 0n) errors.push('Amount must be greater than zero.');
  if (to.toLowerCase() === acct.address.toLowerCase()) warnings.push('You are sending to your own address.');

  const [balanceWei, fees] = await Promise.all([
    pub.getBalance({ address: acct.address }),
    pub.estimateFeesPerGas(),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;

  let gas = 21_000n;
  try {
    gas = await pub.estimateGas({ account: acct.address, to: to as `0x${string}`, value: amountWei });
  } catch (e) {
    const msg = (e as Error).message;
    if (!errors.length) {
      errors.push(
        /exceeds the balance|insufficient funds/i.test(msg)
          ? 'Insufficient balance to cover the amount plus the network gas fee.'
          : msg.split('\n')[0].slice(0, 160),
      );
    }
  }
  const feeWei = gas * maxFeePerGas;
  const totalWei = amountWei + feeWei;
  if (totalWei > balanceWei && !errors.length) errors.push('Insufficient balance for the amount plus network gas fee.');

  return { gas, maxFeePerGas, maxPriorityFeePerGas, feeWei, totalWei, balanceWei, feeEth: formatEther(feeWei), errors, warnings };
}

export async function sendEvm(params: {
  chain: EvmChainParams;
  mnemonic: string;
  index: number;
  to: string;
  amountWei: bigint;
  quote: EvmSendQuote;
}): Promise<string> {
  const { chain, mnemonic, index, to, amountWei, quote } = params;
  if (quote.errors.length) throw new Error(quote.errors[0]);
  const acct = account(mnemonic, index);
  const wallet = createWalletClient({ account: acct, chain: viemChain(chain), transport: http() });
  // viem signs locally and broadcasts via eth_sendRawTransaction.
  return wallet.sendTransaction({
    to: to as `0x${string}`,
    value: amountWei,
    gas: quote.gas,
    maxFeePerGas: quote.maxFeePerGas,
    maxPriorityFeePerGas: quote.maxPriorityFeePerGas,
  });
}

export async function waitForEvm(chain: EvmChainParams, hash: string): Promise<boolean> {
  const pub = createPublicClient({ chain: viemChain(chain), transport: http() });
  const receipt = await pub.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 120_000 });
  return receipt.status === 'success';
}
