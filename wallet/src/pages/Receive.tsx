import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownLeft, Check, Copy, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { CHAINS } from '@/lib/chains/registry';
import { ltcExplorerAddressUrl, ltcExplorerTxUrl } from '@/lib/crypto/litecoin';
import { LITOSHIS_PER_LTC } from '@/lib/api/litecoin';
import { explorerAddressUrl, NETWORK_LIST, NETWORKS, type SolanaNetwork } from '@/lib/solana/networks';
import { formatAmount, formatFiat, shortAddress, timeAgo, toNumber } from '@/lib/format';
import { friendlyError } from '@/lib/solana/errors';
import { useClipboard } from '@/hooks/useClipboard';
import { useLitecoinAccount, useLitecoinAddress, useLitecoinPrice } from '@/hooks/useLitecoin';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, cn, EmptyState, Notice, Segmented, Skeleton } from '@/components/ui/primitives';
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
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition-colors',
              cluster === n.id ? 'border-white/20 bg-white/[0.08] text-mist-100' : 'border-white/[0.06] text-mist-400 hover:text-mist-200',
            )}
          >
            <NetworkDot network={n.id} /> {n.short}
          </button>
        ))}
      </div>
      <Qr value={`solana:${address}`} />
      <p className="mt-3 text-center text-xs text-mist-400">Scan to send SOL or SPL tokens on {NETWORKS[cluster].label}</p>
      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <p className="mb-1 text-xs font-medium text-mist-400">Your Solana address</p>
        <p className="break-all font-mono text-[15px] leading-relaxed" data-testid="receive-address">
          {address}
        </p>
      </div>
      <AddressActions address={address} explorerUrl={explorerAddressUrl(cluster, address)} label="Address" />
      <div className="mt-5 space-y-2.5">
        {cluster !== network && (
          <Notice tone="warn" title={`Nocta is currently showing ${NETWORKS[network].label}`}>
            Funds sent on {NETWORKS[cluster].label} arrive at this same address but will only be visible after you switch networks.
            <button onClick={() => request(cluster)} className="ml-1 font-semibold underline underline-offset-2">
              Switch to {NETWORKS[cluster].short}
            </button>
          </Notice>
        )}
        {NETWORKS[cluster].isTestnet ? (
          <Notice>{NETWORKS[cluster].short} tokens are for testing and have no value. Never buy “test SOL”.</Notice>
        ) : (
          <Notice tone="warn">Only send Solana-network assets (SOL and SPL tokens). Assets from other blockchains sent here will be lost.</Notice>
        )}
      </div>
      {dialog}
    </>
  );
}

function LitecoinReceive() {
  const [type, setType] = useState<'segwit' | 'legacy'>('segwit');
  const address = useLitecoinAddress(type);
  const acct = useLitecoinAccount(address);
  const price = useLitecoinPrice();
  const currency = useSettings((s) => s.currency);
  const hide = useSettings((s) => s.hideBalances);

  if (!address)
    return (
      <Notice tone="warn" title="No Litecoin address for this account">
        Litecoin addresses are derived from a recovery phrase. This account was imported from a Solana private key, which has no phrase. Switch to a recovery-phrase account to receive LTC.
      </Notice>
    );

  const balanceLtc = acct.data ? toNumber(acct.data.balance + acct.data.unconfirmed, 8) : undefined;
  const balanceFiat = balanceLtc != null && price.data != null ? balanceLtc * price.data : undefined;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'segwit', label: 'SegWit (ltc1)' },
            { value: 'legacy', label: 'Legacy (L)' },
          ]}
        />
        <button onClick={() => acct.refetch()} className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label="Refresh Litecoin balance">
          <RefreshCw className={cn('h-4 w-4', acct.isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <TokenIcon symbol="LTC" mint="litecoin" size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-mist-400">Litecoin balance</p>
          {acct.isLoading ? (
            <Skeleton className="mt-1 h-6 w-28" />
          ) : acct.isError ? (
            <p className="text-sm text-down">Balance unavailable</p>
          ) : (
            <p className="num text-xl font-bold">
              {hide ? '••••' : formatAmount(balanceLtc ?? 0)} <span className="text-sm text-mist-400">LTC</span>
            </p>
          )}
        </div>
        {balanceFiat != null && !hide && <p className="text-sm text-mist-300">{formatFiat(balanceFiat, currency)}</p>}
      </div>

      <Qr value={`litecoin:${address}`} />
      <p className="mt-3 text-center text-xs text-mist-400">Scan to send Litecoin to this wallet</p>

      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
        <p className="mb-1 flex items-center gap-2 text-xs font-medium text-mist-400">
          Your Litecoin address <Badge>{type === 'segwit' ? 'Native SegWit' : 'Legacy'}</Badge>
        </p>
        <p className="break-all font-mono text-[15px] leading-relaxed" data-testid="ltc-address">
          {address}
        </p>
      </div>
      <AddressActions address={address} explorerUrl={ltcExplorerAddressUrl(address)} label="Litecoin address" />

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-mist-300">Recent Litecoin activity</p>
        {acct.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : acct.isError ? (
          <Notice tone="warn">{friendlyError(acct.error)}</Notice>
        ) : !acct.data?.txs.length ? (
          <EmptyState icon={<ArrowDownLeft className="h-5 w-5" />} title="No transactions yet" body="Litecoin sent here will appear in a minute or two." />
        ) : (
          <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06]">
            {acct.data.txs.map((t) => {
              const amt = toNumber(t.value, 8);
              return (
                <a key={t.hash} href={ltcExplorerTxUrl(t.hash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{amt >= 0 ? 'Received' : 'Sent'}</span>
                    <span className="block font-mono text-xs text-mist-400">
                      {shortAddress(t.hash, 6)} · {t.confirmations === 0 ? 'unconfirmed' : timeAgo(t.confirmed ? Math.floor(new Date(t.confirmed).getTime() / 1000) : null)}
                    </span>
                  </span>
                  <span className={cn('num text-sm font-semibold', amt >= 0 ? 'text-up' : 'text-mist-100')}>
                    {amt >= 0 ? '+' : ''}
                    {formatAmount(amt)} LTC
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-mist-400" />
                </a>
              );
            })}
          </div>
        )}
      </div>

      <Notice tone="warn" className="mt-5">
        Send only <strong>Litecoin (LTC)</strong> to this address. Sending any other coin will lose it. Nocta can receive LTC today; sending LTC from Nocta is not available yet.
      </Notice>
      <p className="mt-2 text-center text-[11px] text-mist-400">LTC {Number(LITOSHIS_PER_LTC) === 1e8 ? '' : ''}balance & history via BlockCypher · address derived on your device (BIP-84).</p>
    </>
  );
}

export function Receive() {
  const account = useActiveAccount();
  const [chain, setChain] = useState('solana');
  if (!account) return null;
  const active = CHAINS.find((c) => c.id === chain);
  const comingSoon = active && !active.enabled;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Receive" subtitle={account.name} back="/" />
      <Card className="p-5 sm:p-6">
        <span className="mb-2 block text-sm font-medium text-mist-300">Network</span>
        <div className="scrollbar-none -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChain(c.id)}
              className={cn(
                'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                chain === c.id ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] bg-white/[0.03] text-mist-300 hover:bg-white/[0.06]',
                !c.enabled && 'opacity-70',
              )}
            >
              {c.name}
              {c.support === 'receive' && c.enabled && <span className="ml-1.5 text-[10px] uppercase text-accent">receive</span>}
              {!c.enabled && <span className="ml-1.5 text-[10px] uppercase text-mist-400">soon</span>}
            </button>
          ))}
        </div>

        {comingSoon ? (
          <Notice tone="danger" title={`${active?.name} is not supported yet`}>
            Do NOT send {active?.nativeSymbol} to your Solana or Litecoin address — it would be lost. Nocta currently supports Solana (send & receive) and Litecoin (receive).
          </Notice>
        ) : chain === 'litecoin' ? (
          <LitecoinReceive />
        ) : (
          <SolanaReceive />
        )}
      </Card>
    </div>
  );
}
