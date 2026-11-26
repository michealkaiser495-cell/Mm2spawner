import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search } from 'lucide-react';
import { searchTokens, type JupToken } from '@/lib/api/jupiter';
import { formatAmount, shortAddress } from '@/lib/format';
import { Badge, cn, Spinner } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { TokenIcon } from '../ui/TokenIcon';

export interface PickableToken {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  verified: boolean;
  balance?: number;
  isNative?: boolean;
  tokenProgram?: string;
}

export function fromJup(t: JupToken): PickableToken {
  return { mint: t.id, symbol: t.symbol, name: t.name, icon: t.icon, decimals: t.decimals, verified: !!t.isVerified, tokenProgram: t.tokenProgram };
}

export function TokenButton({ token, onClick, className }: { token?: PickableToken; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] pl-1.5 pr-3 font-semibold transition-colors hover:bg-white/[0.1]', className)}
    >
      {token ? <TokenIcon symbol={token.symbol} icon={token.icon} mint={token.mint} isNative={token.isNative} size={30} /> : <span className="h-[30px] w-[30px] rounded-full bg-white/10" />}
      <span>{token?.symbol ?? 'Select'}</span>
      <ChevronDown className="h-4 w-4 text-mist-400" />
    </button>
  );
}

/** Token selection sheet: local list first, optional remote search (Jupiter) by name/symbol/mint. */
export function TokenPicker({
  open,
  onOpenChange,
  tokens,
  onSelect,
  remoteSearch,
  title = 'Select token',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokens: PickableToken[];
  onSelect: (t: PickableToken) => void;
  remoteSearch?: boolean;
  title?: string;
}) {
  const [q, setQ] = useState('');
  const term = q.trim();
  const local = useMemo(() => {
    const s = term.toLowerCase();
    return s ? tokens.filter((t) => t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.mint === term) : tokens;
  }, [tokens, term]);
  const remote = useQuery({
    queryKey: ['token-search', term],
    queryFn: () => searchTokens(term),
    enabled: !!remoteSearch && term.length >= 2,
    staleTime: 60_000,
  });
  const remoteList = (remote.data ?? []).map(fromJup).filter((t) => !local.some((l) => l.mint === t.mint));

  const pick = (t: PickableToken) => {
    onSelect(t);
    onOpenChange(false);
    setQ('');
  };

  const Item = ({ t }: { t: PickableToken }) => (
    <button type="button" onClick={() => pick(t)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.05]">
      <TokenIcon symbol={t.symbol} icon={t.icon} mint={t.mint} isNative={t.isNative} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold">
          {t.symbol}
          {!t.verified && <Badge tone="warn">Unverified</Badge>}
        </span>
        <span className="block truncate text-xs text-mist-400">
          {t.name} · {t.isNative ? 'Native' : shortAddress(t.mint)}
        </span>
      </span>
      {t.balance != null && <span className="num text-sm text-mist-300">{formatAmount(t.balance)}</span>}
    </button>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={remoteSearch ? 'Search name, symbol or mint address' : 'Search'}
          className="h-11 w-full rounded-xl border border-white/[0.08] bg-ink-850 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent-from)]"
        />
      </div>
      <div className="-mx-2 max-h-[55vh] overflow-y-auto">
        {local.map((t) => (
          <Item key={t.mint} t={t} />
        ))}
        {remoteSearch && term.length >= 2 && (
          <>
            {remote.isFetching && (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            )}
            {remoteList.length > 0 && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-mist-400">Search results</p>}
            {remoteList.map((t) => (
              <Item key={t.mint} t={t} />
            ))}
            {remote.isError && <p className="px-3 py-3 text-sm text-down">Search unavailable right now.</p>}
          </>
        )}
        {!local.length && !remoteList.length && !remote.isFetching && <p className="px-3 py-8 text-center text-sm text-mist-400">No tokens found</p>}
      </div>
    </Modal>
  );
}
