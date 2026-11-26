import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { unlockWaitMs, useWallet } from '@/state/wallet';
import { Button } from '@/components/ui/primitives';
import { LogoMark } from '@/components/ui/Logo';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/wallet/SetupParts';

export function Unlock() {
  const unlock = useWallet((s) => s.unlock);
  const resetAll = useWallet((s) => s.resetAll);
  const navigate = useNavigate();
  const loc = useLocation();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(unlockWaitMs());
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait(unlockWaitMs()), 500);
    return () => clearInterval(id);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await unlock(pw);
      setPw('');
      const from = (loc.state as { from?: string } | null)?.from;
      navigate(from && from !== '/unlock' ? from : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setWait(unlockWaitMs());
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh place-items-center px-4">
      <div className="aurora-bg" />
      <div className="grain" />
      <form onSubmit={submit} className="glass relative z-10 w-full max-w-sm animate-rise rounded-[28px] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 w-fit rounded-[22px]">
          <LogoMark size={68} />
        </div>
        <h1 className="font-display text-2xl font-bold">Welcome back</h1>
        <p className="mb-6 mt-1 text-sm text-mist-400">Enter your password to unlock</p>
        <div className="text-left">
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus error={error} aria-label="Password" />
        </div>
        <Button type="submit" variant="primary" size="lg" block className="mt-4" loading={busy} disabled={!pw || wait > 0}>
          <Lock className="h-4 w-4" /> {wait > 0 ? `Try again in ${Math.ceil(wait / 1000)}s` : 'Unlock'}
        </Button>
        <button type="button" onClick={() => setResetOpen(true)} className="mt-5 text-xs text-mist-400 hover:text-mist-200">
          Forgot password?
        </button>
      </form>

      <Modal open={resetOpen} onOpenChange={setResetOpen} title="Reset Nocta on this device">
        <div className="space-y-4 text-sm text-mist-300">
          <p>Your password cannot be recovered. You can remove the wallet from this device and restore it with your recovery phrase.</p>
          <p className="rounded-xl border border-down/30 bg-down/[0.08] p-3 text-down">
            Without your recovery phrase (and backups of any imported private keys), your funds will be permanently lost.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-mist-400">
              Type <span className="font-mono text-mist-100">RESET</span> to confirm
            </span>
            <input value={resetText} onChange={(e) => setResetText(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-ink-850 px-3 font-mono outline-none focus:border-down" />
          </label>
          <Button
            variant="danger"
            block
            disabled={resetText !== 'RESET'}
            onClick={() => {
              resetAll();
              navigate('/onboarding', { replace: true });
            }}
          >
            Remove wallet from this device
          </Button>
        </div>
      </Modal>
    </div>
  );
}
