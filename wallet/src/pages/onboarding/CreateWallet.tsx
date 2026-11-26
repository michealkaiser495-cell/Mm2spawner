import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PenLine, EyeOff, Users } from 'lucide-react';
import { createMnemonic } from '@/lib/crypto/keys';
import { useWallet } from '@/state/wallet';
import { Button, Notice, Segmented } from '@/components/ui/primitives';
import { CheckItem, PasswordSetup, PhraseGrid, PhraseVerify, Steps } from '@/components/wallet/SetupParts';
import { OnboardingLayout } from './OnboardingLayout';

type Step = 'password' | 'phrase' | 'verify';

export function CreateWallet() {
  const navigate = useNavigate();
  const createVault = useWallet((s) => s.createVault);
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [words, setWords] = useState<12 | 24>(12);
  const [phrase, setPhrase] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [written, setWritten] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhrase(createMnemonic(words));
    setRevealed(false);
    setWritten(false);
  }, [words]);

  // Drop secrets from component state on unmount.
  useEffect(() => () => {
    setPhrase('');
    setPassword('');
  }, []);

  const finish = async (backedUp: boolean) => {
    setBusy(true);
    try {
      await createVault({ password, secret: { type: 'mnemonic', mnemonic: phrase, backedUp } });
      toast.success(backedUp ? 'Wallet created and backed up' : 'Wallet created — remember to back up');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const idx = { password: 0, phrase: 1, verify: 2 }[step];
  const back = step === 'password' ? '/onboarding' : () => setStep(step === 'verify' ? 'phrase' : 'password');

  return (
    <OnboardingLayout back={back} wide={step !== 'password'}>
      <Steps step={idx} total={3} />
      {step === 'password' && (
        <div className="mt-5">
          <h2 className="font-display text-2xl font-bold">Create a password</h2>
          <p className="mb-6 mt-1 text-sm text-mist-400">Encrypts your wallet on this device (PBKDF2 · AES-256-GCM).</p>
          <PasswordSetup
            onSubmit={(pw) => {
              setPassword(pw);
              setStep('phrase');
            }}
          />
        </div>
      )}

      {step === 'phrase' && (
        <div className="mt-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">Your recovery phrase</h2>
              <p className="mt-1 text-sm text-mist-400">The master key to your wallet. Write it down in order and store it offline.</p>
            </div>
            <Segmented size="sm" value={String(words) as '12' | '24'} onChange={(v) => setWords(Number(v) as 12 | 24)} options={[{ value: '12', label: '12' }, { value: '24', label: '24' }]} />
          </div>
          <ul className="space-y-2">
            <CheckItem>
              <span className="inline-flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" /> Write it on paper. Avoid screenshots, cloud notes and email.</span>
            </CheckItem>
            <CheckItem>
              <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Never share it. Nocta support will never ask for it.</span>
            </CheckItem>
            <CheckItem>
              <span className="inline-flex items-center gap-1.5"><EyeOff className="h-3.5 w-3.5" /> Anyone with these words can take your funds.</span>
            </CheckItem>
          </ul>
          {phrase && <PhraseGrid phrase={phrase} onRevealed={() => setRevealed(true)} />}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-mist-300">
            <input type="checkbox" disabled={!revealed} checked={written} onChange={(e) => setWritten(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-from)]" />
            I have written down my recovery phrase and stored it somewhere safe.
          </label>
          <Button variant="primary" size="lg" block disabled={!written} onClick={() => setStep('verify')}>
            Continue
          </Button>
          <button className="w-full text-center text-xs text-mist-400 underline-offset-2 hover:text-mist-200 hover:underline" onClick={() => finish(false)} disabled={busy}>
            Skip backup for now (not recommended)
          </button>
        </div>
      )}

      {step === 'verify' && (
        <div className="mt-5 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-bold">Confirm your backup</h2>
            <p className="mt-1 text-sm text-mist-400">Pick the correct words to prove your backup is accurate.</p>
          </div>
          <PhraseVerify phrase={phrase} onVerified={() => finish(true)} />
          {busy && <Notice>Encrypting your wallet…</Notice>}
        </div>
      )}
    </OnboardingLayout>
  );
}
