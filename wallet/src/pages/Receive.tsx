import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { CHAINS } from '@/lib/chains/registry';
import { explorerAddressUrl, NETWORK_LIST, NETWORKS, type SolanaNetwork } from '@/lib/solana/networks';
import { useClipboard } from '@/hooks/useClipboard';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, cn, Notice } from '@/components/ui/primitives';
import { LogoMark } from '@/components/ui/Logo';
import { NetworkDot, useSwitchNetwork } from '@/components/wallet/NetworkSelector';

export function Receive() {
  const account = useActiveAccount();
  const network = useSettings((s) => s.network);
  const [chain, setChain] = useState('solana');
  const [cluster, setCluster] = useState<SolanaNetwork>(network);
  const { copy, copied } = useClipboard();
  const { request, dialog } = useSwitchNetwork();
  if (!account) return null;
  const address = account.publicKey;
  const unsupported = chain !== 'solana';

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Receive" subtitle={`${account.name}`} back="/" />
      <Card className="p-5 sm:p-6">
        <span className="mb-2 block text-sm font-medium text-mist-300">Network</span>
        <div className="scrollbar-none -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
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
              {!c.enabled && <span className="ml-1.5 text-[10px] uppercase text-mist-400">soon</span>}
            </button>
          ))}
        </div>

        {unsupported ? (
          <Notice tone="danger" title={`${CHAINS.find((c) => c.id === chain)?.name} is not supported yet`}>
            Do NOT send {CHAINS.find((c) => c.id === chain)?.nativeSymbol} or tokens from that network to your Solana address — they would be lost. Nocta currently supports Solana only.
          </Notice>
        ) : (
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

            <div className="mx-auto w-fit rounded-[28px] bg-white p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
              <div className="relative">
                <QRCodeSVG value={`solana:${address}`} size={208} level="M" bgColor="#ffffff" fgColor="#07080c" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-1">
                  <LogoMark size={34} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-mist-400">Scan to send SOL or SPL tokens on {NETWORKS[cluster].label}</p>

            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-ink-850/70 p-4">
              <p className="mb-1 text-xs font-medium text-mist-400">Your Solana address</p>
              <p className="break-all font-mono text-[15px] leading-relaxed" data-testid="receive-address">
                {address}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={() => copy(address, { label: 'Address' })}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy address'}
              </Button>
              {typeof navigator.share === 'function' ? (
                <Button onClick={() => navigator.share({ text: address }).catch(() => undefined)}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              ) : (
                <a href={explorerAddressUrl(cluster, address)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium hover:bg-white/[0.1]">
                  <ExternalLink className="h-4 w-4" /> Explorer
                </a>
              )}
            </div>

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
          </>
        )}
      </Card>
      {dialog}
    </div>
  );
}
