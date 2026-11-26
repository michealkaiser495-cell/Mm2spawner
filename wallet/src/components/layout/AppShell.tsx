import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Compass, History, Home, Lock, Search, Settings, ShieldAlert } from 'lucide-react';
import { NETWORKS } from '@/lib/solana/networks';
import { useSettings } from '@/state/settings';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { useAutoLock } from '@/hooks/useAutoLock';
import { AccountSelector } from '../wallet/AccountSelector';
import { NetworkSelector } from '../wallet/NetworkSelector';
import { Logo, LogoMark } from '../ui/Logo';
import { cn } from '../ui/primitives';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/swap', label: 'Swap', icon: ArrowLeftRight },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/activity', label: 'Activity', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form onSubmit={submit} role="search" className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tokens, symbols or addresses"
        aria-label="Search tokens"
        className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-mist-400/80 focus:border-[var(--accent-from)] focus:bg-white/[0.05]"
      />
    </form>
  );
}

export function AppShell() {
  useAutoLock();
  const network = useSettings((s) => s.network);
  const lock = useWallet((s) => s.lock);
  const keyrings = useWallet((s) => s.keyrings);
  const active = useActiveAccount();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const loc = useLocation();
  const cfg = NETWORKS[network];
  const needsBackup = keyrings.find((k) => k.id === active?.keyringId && !k.backedUp);

  const doLock = () => {
    lock();
    qc.removeQueries();
    navigate('/unlock');
  };

  return (
    <div className="relative min-h-dvh">
      <div className="aurora-bg" />
      <div className="grain" />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.05] bg-ink-950/40 px-4 py-6 backdrop-blur-xl lg:flex">
        <Logo className="px-2" />
        <nav className="mt-10 flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all',
                  isActive ? 'bg-white/[0.07] text-mist-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'text-mist-400 hover:bg-white/[0.04] hover:text-mist-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-[18px] w-[18px]', isActive && 'text-accent')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-mist-400">
            <p className="font-semibold text-mist-200">Self-custody</p>
            <p className="mt-1 leading-relaxed">Keys are encrypted on this device and never leave it.</p>
          </div>
          <button onClick={doLock} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-mist-400 transition-colors hover:bg-white/[0.05] hover:text-mist-100">
            <Lock className="h-4 w-4" /> Lock wallet
          </button>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-64">
        {cfg.isTestnet && (
          <div className="flex items-center justify-center gap-2 border-b border-[#a78bfa]/20 bg-[#a78bfa]/[0.08] px-4 py-1.5 text-center text-xs font-medium text-[#c4b5fd]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a78bfa]" />
            {cfg.label} — test tokens only, no real-world value
          </div>
        )}
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-[color-mix(in_oklab,var(--surface-bg)_75%,transparent)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
            <LogoMark size={30} className="hidden sm:block lg:hidden" />
            <AccountSelector />
            <GlobalSearch className="ml-auto hidden max-w-md flex-1 md:block" />
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <NetworkSelector compact={false} />
              <button onClick={doLock} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-mist-300 hover:bg-white/[0.08] lg:hidden" aria-label="Lock wallet">
                <Lock className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12" key={loc.pathname.split('/')[1]}>
          {needsBackup && !loc.pathname.startsWith('/settings/backup') && (
            <button
              onClick={() => navigate('/settings/backup')}
              className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-left text-sm text-warn transition-colors hover:bg-warn/[0.11]"
            >
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                <span className="font-semibold">Back up your recovery phrase.</span>{' '}
                <span className="opacity-85">If you lose this device without a backup, your funds are gone forever.</span>
              </span>
              <span className="hidden font-semibold underline underline-offset-2 sm:inline">Back up now</span>
            </button>
          )}
          <div className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors', isActive ? 'text-mist-100' : 'text-mist-400')}
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-5 w-5', isActive && 'text-accent')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: React.ReactNode; back?: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <button onClick={() => navigate(back)} className="mb-2 text-sm font-medium text-mist-400 hover:text-mist-200">
            ← Back
          </button>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mist-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
