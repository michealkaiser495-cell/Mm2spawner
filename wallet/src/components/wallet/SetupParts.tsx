import { useMemo, useState } from 'react';
import { Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { Button, cn, Input } from '../ui/primitives';

// ------------------------------------------------------------------ passcode strength
const COMMON_PINS = new Set(['1234', '0000', '1111', '4321', '2580', '1212', '123456', '000000', '111111', '654321', '121212', '112233']);
function isSequential(pw: string): boolean {
  if (pw.length < 4) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < pw.length; i++) {
    if (pw.charCodeAt(i) - pw.charCodeAt(i - 1) !== 1) up = false;
    if (pw.charCodeAt(i - 1) - pw.charCodeAt(i) !== 1) down = false;
  }
  return up || down;
}

/** Passcode strength (digits only). A short/common PIN scores low but is still allowed. */
export function passwordScore(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  if (/^(\d)\1+$/.test(pw) || COMMON_PINS.has(pw) || isSequential(pw)) return { score: 1, label: 'Weak' };
  let s = 0;
  if (pw.length >= 4) s++;
  if (pw.length >= 6) s++;
  if (pw.length >= 8) s++;
  if (pw.length >= 10) s++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  const score = Math.min(4, s);
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

export const MIN_PASSWORD = 4; // minimum passcode length

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 12);

/** Numeric passcode input (shows a number keypad on phones). */
export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      right={
        <button type="button" onClick={() => setShow((s) => !s)} className="rounded-lg p-2 text-mist-400 hover:text-mist-100" aria-label={show ? 'Hide passcode' : 'Show passcode'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

export function PasswordSetup({ onSubmit, submitLabel = 'Continue', loading }: { onSubmit: (pw: string) => void; submitLabel?: string; loading?: boolean }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const { score, label } = passwordScore(pw);
  const mismatch = confirm.length > 0 && pw !== confirm;
  const valid = pw.length >= MIN_PASSWORD && pw === confirm && agree;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(pw);
      }}
    >
      <div>
        <PasswordInput label="Create a passcode" value={pw} onChange={(e) => setPw(onlyDigits(e.target.value))} placeholder="At least 4 digits" autoFocus />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', pw && i < score ? (score <= 1 ? 'bg-down' : score === 2 ? 'bg-warn' : 'bg-up') : 'bg-white/10')} />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-mist-400">{label}</span>
        </div>
      </div>
      <PasswordInput label="Confirm passcode" value={confirm} onChange={(e) => setConfirm(onlyDigits(e.target.value))} error={mismatch ? 'Passcodes do not match' : undefined} />
      {pw.length >= MIN_PASSWORD && score <= 1 && (
        <p className="text-xs text-warn">A longer passcode (6+ digits, not a pattern like 1234) is much harder to guess. Use what you like, but longer is safer.</p>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-mist-300">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-from)]" />
        <span>I understand this passcode unlocks Nocta on this device only. It cannot be recovered — my recovery phrase is the only backup.</span>
      </label>
      <Button type="submit" variant="primary" size="lg" block disabled={!valid} loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ phrase display
export function PhraseGrid({ phrase, onRevealed }: { phrase: string; onRevealed?: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const { copy } = useClipboard();
  const words = phrase.split(' ');
  return (
    <div>
      <div className="relative">
        <ol className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', !revealed && 'select-none blur-md')} aria-hidden={!revealed}>
          {words.map((w, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-ink-850/80 px-3 py-2.5 font-mono text-sm">
              <span className="w-5 text-right text-xs text-mist-400">{i + 1}</span>
              <span className="font-medium">{revealed ? w : '•••••'}</span>
            </li>
          ))}
        </ol>
        {!revealed && (
          <button
            type="button"
            onClick={() => {
              setRevealed(true);
              onRevealed?.();
            }}
            className="absolute inset-0 grid place-items-center rounded-2xl bg-ink-900/40 text-sm font-semibold"
          >
            <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800/90 px-4 py-2.5">
              <Eye className="h-4 w-4" /> Reveal recovery phrase
            </span>
          </button>
        )}
      </div>
      {revealed && (
        <div className="mt-3 flex justify-between text-sm">
          <button type="button" onClick={() => setRevealed(false)} className="text-mist-400 hover:text-mist-200">
            Hide
          </button>
          <button type="button" onClick={() => copy(phrase, { sensitive: true, label: 'Recovery phrase' })} className="text-mist-400 hover:text-mist-200">
            Copy (not recommended)
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ phrase verification
function pickIndexes(n: number, count: number): number[] {
  const set = new Set<number>();
  const rnd = crypto.getRandomValues(new Uint32Array(count * 4));
  let i = 0;
  while (set.size < count && i < rnd.length) set.add(rnd[i++] % n);
  return [...set].sort((a, b) => a - b);
}

export function PhraseVerify({ phrase, onVerified }: { phrase: string; onVerified: () => void }) {
  const words = useMemo(() => phrase.split(' '), [phrase]);
  const idx = useMemo(() => pickIndexes(words.length, 3), [words]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState(false);

  // Options: correct word + 5 decoys from the phrase itself, shuffled.
  const options = useMemo(() => {
    const out: Record<number, string[]> = {};
    for (const i of idx) {
      const pool = words.filter((_, j) => j !== i);
      const r = crypto.getRandomValues(new Uint32Array(pool.length));
      const decoys = pool.map((w, j) => [w, r[j]] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
      const uniq = [...new Set([words[i], ...decoys])].slice(0, 6);
      const r2 = crypto.getRandomValues(new Uint32Array(uniq.length));
      out[i] = uniq.map((w, j) => [w, r2[j]] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    }
    return out;
  }, [idx, words]);

  const complete = idx.every((i) => answers[i]);
  return (
    <div className="space-y-5">
      {idx.map((i) => (
        <div key={i}>
          <p className="mb-2 text-sm font-medium text-mist-300">
            Select word <span className="text-mist-100">#{i + 1}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {options[i].map((w) => (
              <button
                type="button"
                key={w}
                onClick={() => {
                  setError(false);
                  setAnswers((a) => ({ ...a, [i]: w }));
                }}
                className={cn(
                  'rounded-xl border px-2 py-2.5 font-mono text-sm transition-all',
                  answers[i] === w ? 'accent-ring border-transparent bg-white/[0.08] text-mist-100' : 'border-white/[0.07] bg-ink-850/70 text-mist-300 hover:border-white/20',
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-down">That doesn’t match. Check your written backup and try again.</p>}
      <Button
        variant="primary"
        size="lg"
        block
        disabled={!complete}
        onClick={() => {
          if (idx.every((i) => answers[i] === words[i])) onVerified();
          else {
            setError(true);
            setAnswers({});
          }
        }}
      >
        <ShieldCheck className="h-5 w-5" /> Verify backup
      </Button>
    </div>
  );
}

export function Steps({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'accent-gradient w-6' : i < step ? 'w-1.5 bg-mist-300' : 'w-1.5 bg-white/15')} />
      ))}
    </div>
  );
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm text-mist-300">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}
