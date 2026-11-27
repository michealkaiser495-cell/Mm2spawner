/**
 * EVM sending (Ethereum, Base, Polygon, Arbitrum). Built on viem (audited) — viem handles
 * EIP-1559 construction, signing and broadcasting; we never hand-roll transaction crypto.
 * Signing was verified against the canonical mnemonic→address vector and sender recovery.
 *
 * Fees use the network's own EIP-1559 estimate (base fee + a small priority tip), which is the
 * cheapest rate that still confirms. On L2s (Base/Arbitrum/Polygon) this is a fraction of a cent.
 */
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, isAddress, type Chain } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { EvmChainParams } from '../crypto/evm';
import type { EvmToken } from './evmTokens';

const ERC20_TRANSFER_ABI = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

/** Calldata for an ERC-20 transfer of `amount` base units to `to`. */
export function erc20TransferData(to: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to as `0x${string}`, amount] });
}

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
  totalWei: bigint; // native spent: amount (native) or fee only (token)
  balanceWei: bigint; // native balance
  feeEth: string;
  errors: string[];
  warnings: string[];
}

/**
 * Prepare a native coin OR ERC-20 token send. When `token` is set, `amount` is in that token's
 * base units and the transaction is a `transfer()` call (gas paid in the chain's native coin);
 * otherwise it's a plain native-value transfer. Returns a quote with fee + validation.
 */
export async function prepareEvmSend(params: {
  chain: EvmChainParams;
  mnemonic: string;
  index: number;
  to: string;
  amountWei: bigint;
  token?: EvmToken;
}): Promise<EvmSendQuote> {
  const { chain, mnemonic, index, to, amountWei, token } = params;
  const acct = account(mnemonic, index);
  const pub = createPublicClient({ chain: viemChain(chain), transport: http() });
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isAddress(to)) errors.push('Recipient is not a valid EVM (0x…) address.');
  if (amountWei <= 0n) errors.push('Amount must be greater than zero.');
  if (to.toLowerCase() === acct.address.toLowerCase()) warnings.push('You are sending to your own address.');

  // For a token send the on-chain target is the token contract with transfer() calldata.
  const txTo = (token ? token.address : to) as `0x${string}`;
  const txValue = token ? 0n : amountWei;
  const txData = token ? erc20TransferData(to, amountWei) : undefined;

  const [balanceWei, fees, tokenBal] = await Promise.all([
    pub.getBalance({ address: acct.address }),
    pub.estimateFeesPerGas(),
    token
      ? pub.readContract({ address: token.address, abi: ERC20_TRANSFER_ABI, functionName: 'balanceOf', args: [acct.address] }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;

  if (token && tokenBal != null && amountWei > (tokenBal as bigint) && !errors.length) {
    errors.push(`Insufficient ${token.symbol} balance.`);
  }

  let gas = token ? 65_000n : 21_000n;
  try {
    gas = await pub.estimateGas({ account: acct.address, to: txTo, value: txValue, data: txData });
  } catch (e) {
    const msg = (e as Error).message;
    if (!errors.length) {
      errors.push(
        /exceeds the balance|insufficient funds/i.test(msg)
          ? `Not enough ${chain.symbol} to cover the network gas fee.`
          : msg.split('\n')[0].slice(0, 160),
      );
    }
  }
  const feeWei = gas * maxFeePerGas;
  // Native coin spent by this tx: the value transferred (native send) plus the gas fee.
  const totalWei = txValue + feeWei;
  if (totalWei > balanceWei && !errors.length) {
    errors.push(token ? `Not enough ${chain.symbol} to pay the gas fee.` : 'Insufficient balance for the amount plus network gas fee.');
  }

  return { gas, maxFeePerGas, maxPriorityFeePerGas, feeWei, totalWei, balanceWei, feeEth: formatEther(feeWei), errors, warnings };
}

export async function sendEvm(params: {
  chain: EvmChainParams;
  mnemonic: string;
  index: number;
  to: string;
  amountWei: bigint;
  quote: EvmSendQuote;
  token?: EvmToken;
}): Promise<string> {
  const { chain, mnemonic, index, to, amountWei, quote, token } = params;
  if (quote.errors.length) throw new Error(quote.errors[0]);
  const acct = account(mnemonic, index);
  const wallet = createWalletClient({ account: acct, chain: viemChain(chain), transport: http() });
  // viem signs locally and broadcasts via eth_sendRawTransaction.
  return wallet.sendTransaction({
    to: (token ? token.address : to) as `0x${string}`,
    value: token ? 0n : amountWei,
    data: token ? erc20TransferData(to, amountWei) : undefined,
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
