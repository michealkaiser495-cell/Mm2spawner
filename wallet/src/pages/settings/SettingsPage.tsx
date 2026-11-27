import { NavLink, useParams } from 'react-router-dom';
import { ChevronRight, CreditCard, Globe, Info, KeyRound, Lock, Palette, ShieldCheck, Users, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, cn } from '@/components/ui/primitives';
import { WalletsSection } from './WalletsSection';
import { BackupSection, SecuritySection } from './SecuritySection';
import { AboutSection, BuySection, DisplaySection, NetworkSection, PrivacySection } from './PreferenceSections';

const SECTIONS = [
  { id: 'wallets', label: 'Wallets & accounts', desc: 'Create, import, rename, switch', icon: Users, el: <WalletsSection /> },
  { id: 'security', label: 'Security', desc: 'Passcode, auto-lock, signing', icon: Lock, el: <SecuritySection /> },
  { id: 'backup', label: 'Recovery & backup', desc: 'Recovery phrase, private keys', icon: KeyRound, el: <BackupSection /> },
  { id: 'network', label: 'Network', desc: 'Cluster & RPC endpoints', icon: Globe, el: <NetworkSection /> },
  { id: 'buy', label: 'Buy with card', desc: 'Crossmint on-ramp key', icon: CreditCard, el: <BuySection /> },
  { id: 'display', label: 'Display', desc: 'Currency, theme, motion', icon: Palette, el: <DisplaySection /> },
  { id: 'privacy', label: 'Privacy', desc: 'Balances, data sources', icon: EyeOff, el: <PrivacySection /> },
  { id: 'about', label: 'About', desc: 'Version, security model', icon: Info, el: <AboutSection /> },
] as const;

export function SettingsPage() {
  const { section } = useParams();
  const current = SECTIONS.find((s) => s.id === section);

  const nav = (
    <Card className="p-2">
      {SECTIONS.map((s) => (
        <NavLink
          key={s.id}
          to={`/settings/${s.id}`}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors', isActive || (!section && s.id === 'wallets') ? 'lg:bg-white/[0.07]' : '', 'hover:bg-white/[0.05]')
          }
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05]">
            <s.icon className="h-4 w-4 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{s.label}</span>
            <span className="block truncate text-xs text-mist-400">{s.desc}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-mist-400 lg:hidden" />
        </NavLink>
      ))}
    </Card>
  );

  return (
    <div>
      <PageHeader title={current ? current.label : 'Settings'} back={current ? '/settings' : undefined} />
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <div className={cn(current && 'hidden lg:block')}>{nav}</div>
        <div className={cn(!current && 'hidden lg:block')}>
          {current?.el ?? SECTIONS[0].el}
          {!current && (
            <p className="mt-4 flex items-center gap-2 text-xs text-mist-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Settings are stored locally on this device.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
