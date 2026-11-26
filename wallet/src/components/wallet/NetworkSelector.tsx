import { useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { NETWORK_LIST, NETWORKS, type SolanaNetwork } from '@/lib/solana/networks';
import { useSettings } from '@/state/settings';
import { Button, cn, Notice } from '../ui/primitives';
import { Modal } from '../ui/Modal';

export function NetworkDot({ network, className }: { network: SolanaNetwork; className?: string }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', network === 'mainnet-beta' ? 'bg-up' : network === 'devnet' ? 'bg-[#a78bfa]' : 'bg-warn', className)}
      aria-hidden
    />
  );
}

export function useSwitchNetwork() {
  const update = useSettings((s) => s.update);
  const acknowledged = useSettings((s) => s.mainnetAcknowledged);
  const qc = useQueryClient();
  const [pending, setPending] = useState<SolanaNetwork | null>(null);

  const apply = (n: SolanaNetwork) => {
    update({ network: n });
    qc.invalidateQueries();
    toast.success(`Switched to ${NETWORKS[n].label}`);
  };
  const request = (n: SolanaNetwork) => {
    if (n === 'mainnet-beta' && !acknowledged) setPending(n);
    else apply(n);
  };

  const dialog = (
    <Modal open={!!pending} onOpenChange={(v) => !v && setPending(null)} title="Switch to Mainnet?">
      <div className="space-y-4">
        <Notice tone="warn" title="Real funds">
          On Mainnet, transactions move real assets and cannot be reversed. Only continue if your recovery phrase is backed up safely.
        </Notice>
        <div className="flex gap-2">
          <Button block onClick={() => setPending(null)}>
            Stay on {NETWORKS[useSettings.getState().network].short}
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              update({ mainnetAcknowledged: true });
              apply('mainnet-beta');
              setPending(null);
            }}
          >
            I understand
          </Button>
        </div>
      </div>
    </Modal>
  );
  return { request, dialog };
}

export function NetworkSelector({ compact }: { compact?: boolean }) {
  const network = useSettings((s) => s.network);
  const { request, dialog } = useSwitchNetwork();
  return (
    <>
      <DM.Root>
        <DM.Trigger asChild>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-medium text-mist-200 transition-colors hover:bg-white/[0.08]"
            aria-label="Select network"
          >
            <NetworkDot network={network} />
            {!compact && <span>{NETWORKS[network].short}</span>}
            <ChevronDown className="h-3.5 w-3.5 text-mist-400" />
          </button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={8} className="glass-strong z-50 w-64 rounded-2xl p-1.5 shadow-2xl data-[state=open]:animate-rise">
            <DM.Label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-mist-400">
              <Globe className="h-3.5 w-3.5" /> Solana network
            </DM.Label>
            {NETWORK_LIST.map((n) => (
              <DM.Item
                key={n.id}
                onSelect={() => n.id !== network && request(n.id)}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-white/[0.06]"
              >
                <NetworkDot network={n.id} />
                <span className="flex-1">
                  <span className="block font-medium">{n.label}</span>
                  <span className="block text-xs text-mist-400">{n.isTestnet ? 'Test tokens · no real value' : 'Real assets'}</span>
                </span>
                {n.id === network && <Check className="h-4 w-4 text-accent" />}
              </DM.Item>
            ))}
            <DM.Separator className="my-1 h-px bg-white/[0.06]" />
            <DM.Item disabled className="px-3 py-2 text-xs text-mist-400 outline-none">
              Ethereum & more networks — not yet supported
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      {dialog}
    </>
  );
}
