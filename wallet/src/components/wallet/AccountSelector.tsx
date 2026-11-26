import * as DM from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Copy, Plus, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { shortAddress } from '@/lib/format';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { useClipboard } from '@/hooks/useClipboard';
import { AccountAvatar } from './AccountAvatar';

export function AccountSelector() {
  const accounts = useWallet((s) => s.accounts);
  const keyrings = useWallet((s) => s.keyrings);
  const setActive = useWallet((s) => s.setActiveAccount);
  const active = useActiveAccount();
  const navigate = useNavigate();
  const { copy } = useClipboard();
  if (!active) return null;

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="group flex h-10 min-w-0 items-center gap-2.5 rounded-xl px-1.5 pr-3 transition-colors hover:bg-white/[0.06]" aria-label="Select account">
          <AccountAvatar address={active.publicKey} name={active.name} size={30} />
          <span className="min-w-0 text-left leading-tight">
            <span className="block max-w-[9rem] truncate text-sm font-semibold">{active.name}</span>
            <span className="block font-mono text-[11px] text-mist-400">{shortAddress(active.publicKey)}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mist-400 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={8} className="glass-strong z-50 w-72 rounded-2xl p-1.5 shadow-2xl data-[state=open]:animate-rise">
          <DM.Label className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-mist-400">Accounts</DM.Label>
          <div className="max-h-72 overflow-y-auto">
            {accounts.map((a) => {
              const kr = keyrings.find((k) => k.id === a.keyringId);
              return (
                <DM.Item
                  key={a.id}
                  onSelect={() => setActive(a.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-white/[0.06]"
                >
                  <AccountAvatar address={a.publicKey} name={a.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block font-mono text-xs text-mist-400">
                      {shortAddress(a.publicKey)} · {kr?.type === 'privateKey' ? 'Imported' : `#${(a.index ?? 0) + 1}`}
                    </span>
                  </span>
                  {a.id === active.id && <Check className="h-4 w-4 text-accent" />}
                </DM.Item>
              );
            })}
          </div>
          <DM.Separator className="my-1 h-px bg-white/[0.06]" />
          <DM.Item onSelect={() => copy(active.publicKey, { label: 'Address' })} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-white/[0.06]">
            <Copy className="h-4 w-4 text-mist-400" /> Copy address
          </DM.Item>
          <DM.Item onSelect={() => navigate('/settings/wallets?add=1')} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-white/[0.06]">
            <Plus className="h-4 w-4 text-mist-400" /> Add or import account
          </DM.Item>
          <DM.Item onSelect={() => navigate('/settings/wallets')} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-white/[0.06]">
            <Settings2 className="h-4 w-4 text-mist-400" /> Manage accounts
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
