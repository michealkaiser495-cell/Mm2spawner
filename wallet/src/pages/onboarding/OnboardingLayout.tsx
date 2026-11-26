import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

export function OnboardingLayout({ children, back, wide }: { children: ReactNode; back?: string | (() => void); wide?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="relative min-h-dvh">
      <div className="aurora-bg" />
      <div className="grain" />
      <div className="relative z-10 mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <section className="hidden lg:block">
          <Logo />
          <h1 className="mt-10 font-display text-5xl font-bold leading-[1.05] tracking-tight">
            Your keys.
            <br />
            <span className="accent-text">Your crypto.</span>
            <br />
            Nobody else’s.
          </h1>
          <p className="mt-6 max-w-md text-lg text-mist-400">A self-custody Solana wallet with bank-grade encryption, transaction simulation and drainer protection built in.</p>
          <ul className="mt-10 space-y-4 text-sm text-mist-300">
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05]"><KeyRound className="h-4 w-4 text-accent" /></span>
              Keys generated & encrypted on your device — never sent anywhere
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05]"><ShieldCheck className="h-4 w-4 text-accent" /></span>
              Every transaction simulated and inspected before you sign
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05]"><Fingerprint className="h-4 w-4 text-accent" /></span>
              Standard BIP-39 phrases — portable to any Solana wallet
            </li>
          </ul>
        </section>
        <section className={`glass mx-auto w-full rounded-[28px] p-6 shadow-2xl sm:p-8 ${wide ? 'max-w-xl' : 'max-w-md'} animate-rise`}>
          <div className="mb-6 flex items-center justify-between">
            {back ? (
              <button
                onClick={() => (typeof back === 'string' ? navigate(back) : back())}
                className="-ml-2 rounded-lg p-2 text-mist-400 hover:bg-white/[0.05] hover:text-mist-100"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <span />
            )}
            <Logo className="lg:hidden" />
            <span className="w-9" />
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
