import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownLeft, Check, Copy, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import type { ExternalChain } from '@/lib/chains/external';
import { EXTERNAL_CHAINS } from '@/lib/chains/external';
import { explorerAddressUrl, NETWORK_LIST, NETWORKS, type SolanaNetwork } from '@/lib/solana/networks';
import { formatAmount, formatFiat, shortAddress, timeAgo, toNumber } from '@/lib/format';
import { friendlyError } from '@/lib/solana/errors';
import { useClipboard } from '@/hooks/useClipboard';
import { useExternalAccount, useExternalAddress, useExternalPrices, useExternalVariant } from '@/hooks/useExternalChain';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, cn, EmptyState, Notice, Segmented, Skeleton } from '@/components/ui/primitives';
import { ExternalSend } from '@/components/wallet/ExternalSend';
import { LogoMark } from '@/components/ui/Logo';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { NetworkDot, useSwitchNetwork } from '@/components/wallet/NetworkSelector';

function Qr({ value }: { value: string }) {
  return (
    <div className="mx-auto w-fit rounded-[28px] bg-white p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="relative">
        <QRCodeSVG value={value} size={208} level="M" bgColor="#ffffff" fgColor="#07080c" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-1">
          <LogoMark size={34} />
        </div>
      </div>
    </div>
  );
}

function AddressActions({ address, explorerUrl, label }: { address: string; explorerUrl: string; label: string }) {
  const { copy, copied } = useClipboard();
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Button variant="primary" onClick={() => copy(address, { label })} data-testid="copy-address">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy address'}
      </Button>
      {typeof navigator.share === 'function' ? (
        <Button onClick={() => navigator.share({ text: address }).catch(() => undefined)}>
          <Share2 className="h-4 w-4" /> Share
        </Button>
      ) : (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium hover:bg-white/[0.1]">
          <ExternalLink className="h-4 w-4" /> Explorer
        </a>
      )}
    </div>
  );
}

function SolanaReceive() {
  const network = useSettings((s) => s.network);
  const account = useActiveAccount()!;
  const [cluster, setCluster] = useState<SolanaNetwork>(network);
  const { request, dialog } = useSwitchNetwork();
  const address = account.publicKey;
  return (
    <>
      <div className="mb-5 flex gap-2">
        {NETWORK_LIST.map((n) => (
          <button
            key={n.id}
            onClick={() => setCluster(n.id)}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition-colors', cluster === n.id ? 'border-white/20 bg-white/[0.08] text-mist-100' : 'border-white/[0.06] text-mist-400 hover:text-mist-200')}
          >
            <NetworkDot network={n.id} /> {n.short}
          </button>
        ))}
      </div>
      <Qr value={`solana:${address}`} />
      <p className="mt-3 text-center text-xs text-mist-400">Scan to send SOL or SPL tokens on {NETWORKS[cluster].label}</p>
      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <p className="mb-1 text-xs font-medium text-mist-400">Your Solana address</p>
        <p className="break-all font-mono text-[15px] leading-relaxed" data-testid="receive-address">{address}</p>
      </div>
      <AddressActions address={address} explorerUrl={explorerAddressUrl(cluster, address)} label="Address" />
      <div className="mt-5 space-y-2.5">
        {cluster !== network && (
          <Notice tone="warn" title={`Nocta is currently showing ${NETWORKS[network].label}`}>
            Funds sent on {NETWORKS[cluster].label} arrive at this same address but will only be visible after you switch networks.
            <button onClick={() => request(cluster)} className="ml-1 font-semibold underline underline-offset-2">Switch to {NETWORKS[cluster].short}</button>
          </Notice>
        )}
        {NETWORKS[cluster].isTestnet ? (
          <Notice>{NETWORKS[cluster].short} tokens are for testing and have no value.</Notice>
        ) : (
          <Notice tone="warn">Only send Solana-network assets (SOL and SPL tokens) here.</Notice>
        )}
      </div>
      {dialog}
    </>
  );
}

function ExternalReceive({ chain, mode, setMode }: { chain: ExternalChain; mode: 'receive' | 'send'; setMode: (m: 'receive' | 'send') => void }) {
  const [variant, setVariant] = useExternalVariant(chain);
  const address = useExternalAddress(chain, variant);
  const acct = useExternalAccount(chain, address);
  const prices = useExternalPrices();
  const currency = useSettings((s) => s.currency);
  const hide = useSettings((s) => s.hideBalances);
  const price = prices.data?.[chain.coingeckoId];

  if (!address)
    return (
      <Notice tone="warn" title={`No ${chain.name} address for this account`}>
        {chain.name} addresses are derived from a recovery phrase. This account was imported from a Solana private key, which has no phrase. Switch to a recovery-phrase account to receive {chain.symbol}.
      </Notice>
    );

  const bal = acct.data ? toNumber(acct.data.balance + acct.data.unconfirmed, chain.decimals) : undefined;
  const balFiat = bal != null && price != null ? bal * price : undefined;
  const uri = chain.kind === 'evm' ? address : `${chain.uriScheme}:${address}`;

  const toggle = (
    <Segmented className="mb-4 w-full [&>button]:flex-1" value={mode} onChange={setMode} options={[{ value: 'receive', label: 'Receive' }, { value: 'send', label: 'Send' }]} />
  );
  if (mode === 'send')
    return (
      <>
        {toggle}
        <ExternalSend chain={chain} address={address} />
      </>
    );

  return (
    <>
      {toggle}
      <div className="mb-4 flex items-center justify-between gap-3">
        {chain.variants ? (
          <Segmented size="sm" value={variant ?? chain.variants[0].id} onChange={setVariant} options={chain.variants.map((v) => ({ value: v.id, label: v.label }))} />
        ) : (
          <span className="text-xs text-mist-400">{chain.kind === 'evm' ? 'EVM address — works on Ethereum & L2s' : ''}</span>
        )}
        <button onClick={() => acct.refetch()} className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label={`Refresh ${chain.name} balance`}>
          <RefreshCw className={cn('h-4 w-4', acct.isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <TokenIcon symbol={chain.symbol} mint={chain.id} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-mist-400">{chain.name} balance</p>
          {acct.isLoading ? (
            <Skeleton className="mt-1 h-6 w-28" />
          ) : acct.isError ? (
            <p className="text-sm text-down">Balance unavailable</p>
          ) : (
            <p className="num text-xl font-bold">
              {hide ? '••••' : formatAmount(bal ?? 0)} <span className="text-sm text-mist-400">{chain.symbol}</span>
            </p>
          )}
        </div>
        {balFiat != null && !hide && <p className="text-sm text-mist-300">{formatFiat(balFiat, currency)}</p>}
      </div>

      <Qr value={uri} />
      <p className="mt-3 text-center text-xs text-mist-400">Scan to send {chain.symbol} to this wallet</p>

      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <p className="mb-1 text-xs font-medium text-mist-400">Your {chain.name} address</p>
        <p className="break-all font-mono text-[15px] leading-relaxed" data-testid="external-address">{address}</p>
      </div>
      <AddressActions address={address} explorerUrl={chain.explorerAddress(address)} label={`${chain.name} address`} />

      {chain.kind === 'utxo' && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-mist-300">Recent {chain.name} activity</p>
          {acct.isLoading ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : acct.isError ? (
            <Notice tone="warn">{friendlyError(acct.error)}</Notice>
          ) : !acct.data?.txs.length ? (
            <EmptyState icon={<ArrowDownLeft className="h-5 w-5" />} title="No transactions yet" body={`${chain.symbol} sent here will appear shortly.`} />
          ) : (
            <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06]">
              {acct.data.txs.map((t) => {
                const amt = toNumber(t.value, chain.decimals);
                return (
                  <a key={t.hash} href={chain.explorerTx(t.hash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{amt >= 0 ? 'Received' : 'Sent'}</span>
                      <span className="block font-mono text-xs text-mist-400">{shortAddress(t.hash, 6)} · {t.confirmations === 0 ? 'unconfirmed' : timeAgo(t.timestamp)}</span>
                    </span>
                    <span className={cn('num text-sm font-semibold', amt >= 0 ? 'text-up' : 'text-mist-100')}>{amt >= 0 ? '+' : ''}{formatAmount(amt)} {chain.symbol}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-mist-400" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
      {chain.kind === 'evm' && (
        <p className="mt-4 text-center text-xs text-mist-400">
          Full transaction history on{' '}
          <a href={chain.explorerAddress(address)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">the block explorer</a>.
        </p>
      )}

      <Notice tone="warn" className="mt-5">
        Send only <strong>{chain.name} ({chain.symbol})</strong>{chain.kind === 'evm' ? ' or tokens on an EVM network' : ''} to this address. Nocta can receive {chain.symbol} today; sending {chain.symbol} from Nocta is not available yet.
      </Notice>
      <p className="mt-2 text-center text-[11px] text-mist-400">Address derived on your device · {chain.kind === 'utxo' ? 'balance & history via BlockCypher' : 'balance via public RPC'}.</p>
    </>
  );
}

export function Receive() {
  const account = useActiveAccount();
  const [chainId, setChainId] = useState('solana');
  const [mode, setMode] = useState<'receive' | 'send'>('receive');
  const tabs = useMemo(() => [{ id: 'solana', name: 'Solana', symbol: 'SOL' }, ...EXTERNAL_CHAINS], []);
  if (!account) return null;
  const external = EXTERNAL_CHAINS.find((c) => c.id === chainId);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={external && mode === 'send' ? `Send ${external.symbol}` : 'Receive'} subtitle={account.name} back="/" />
      <Card className="p-5 sm:p-6">
        <span className="mb-2 block text-sm font-medium text-mist-300">Choose a coin</span>
        <div className="scrollbar-none -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {tabs.map((c) => (
            <button
              key={c.id}
              onClick={() => { setChainId(c.id); setMode('receive'); }}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors', chainId === c.id ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] bg-white/[0.03] text-mist-300 hover:bg-white/[0.06]')}
            >
              <TokenIcon symbol={c.symbol} mint={c.id === 'solana' ? 'So11111111111111111111111111111111111111112' : c.id} isNative={c.id === 'solana'} size={18} />
              {c.name}
            </button>
          ))}
        </div>
        {external ? <ExternalReceive chain={external} mode={mode} setMode={setMode} /> : <SolanaReceive />}
      </Card>
    </div>
  );
}
