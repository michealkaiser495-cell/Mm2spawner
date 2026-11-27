import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Eye, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { InvalidPasswordError } from '@/lib/crypto/vault';
import { shortAddress } from '@/lib/format';
import { useClipboard } from '@/hooks/useClipboard';
import { AUTO_LOCK_OPTIONS, useSettings } from '@/state/settings';
import { useWallet, type KeyringMeta } from '@/state/wallet';
import { Badge, Button, Notice, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput, PasswordSetup, PhraseGrid, PhraseVerify } from '@/components/wallet/SetupParts';
import { PasswordPrompt } from '@/components/wallet/PasswordPrompt';
import { SettingRow, SettingsCard } from './parts';

const selectCls = 'h-10 rounded-xl border border-white/[0.08] bg-ink-850 px-3 text-sm outline-none focus:border-[var(--accent-from)]';

export function SecuritySection() {
  const s = useSettings();
  const lock = useWallet((st) => st.lock);
  const changePassword = useWallet((st) => st.changePassword);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [oldOk, setOldOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const verify = useWallet((st) => st.verifyPassword);

  const closePw = () => {
    setPwOpen(false);
    setOldPw('');
    setOldOk(false);
    setErr(undefined);
  };

  return (
    <div className="space-y-5">
      <SettingsCard title="Security">
        <SettingRow title="Passcode" desc="Re-encrypts your vault with a fresh salt and key.">
          <Button size="sm" onClick={() => setPwOpen(true)}>
            Change
          </Button>
        </SettingRow>
        <SettingRow title="Auto-lock" desc="Lock after this much inactivity.">
          <select aria-label="Auto-lock timer" className={selectCls} value={s.autoLockMinutes} onChange={(e) => s.update({ autoLockMinutes: Number(e.target.value) })}>
            {AUTO_LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Require passcode to sign" desc="Ask for your passcode before every transaction.">
          <Switch label="Require password to sign" checked={s.requirePasswordToSign} onChange={(v) => s.update({ requirePasswordToSign: v })} />
        </SettingRow>
        <SettingRow title="Clear clipboard" desc="Wipe copied secrets after this delay.">
          <select aria-label="Clipboard clear delay" className={selectCls} value={s.clipboardClearSeconds} onChange={(e) => s.update({ clipboardClearSeconds: Number(e.target.value) })}>
            {[15, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Lock now" desc="Clears decrypted keys from memory.">
          <Button
            size="sm"
            onClick={() => {
              lock();
              qc.removeQueries();
              navigate('/unlock');
            }}
          >
            <Lock className="h-4 w-4" /> Lock
          </Button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Built-in protections" desc="Always on — these cannot be disabled.">
        {[
          'Every transaction is simulated against the network before you can sign',
          'Token approvals (delegations), authority changes and account re-assignments are blocked',
          'Fee payer and signer must match your active account',
          'Duplicate transfers within 3 minutes require an extra confirmation',
          'Recipient addresses are validated; programs, mints and token accounts are rejected',
          'Nothing is ever signed without your explicit confirmation',
        ].map((t) => (
          <div key={t} className="flex gap-3 py-3 text-sm text-mist-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" /> {t}
          </div>
        ))}
      </SettingsCard>

      <Modal open={pwOpen} onOpenChange={(v) => !v && closePw()} title="Change passcode">
        {!oldOk ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await verify(oldPw);
              setBusy(false);
              if (ok) setOldOk(true);
              else setErr('Incorrect passcode');
            }}
          >
            <PasswordInput label="Current passcode" value={oldPw} onChange={(e) => setOldPw(e.target.value)} error={err} autoFocus />
            <Button type="submit" variant="primary" block loading={busy} disabled={!oldPw}>
              Continue
            </Button>
          </form>
        ) : (
          <PasswordSetup
            submitLabel="Update passcode"
            loading={busy}
            onSubmit={async (pw) => {
              setBusy(true);
              try {
                await changePassword(oldPw, pw);
                toast.success('Passcode updated');
                closePw();
              } catch (e) {
                toast.error(e instanceof InvalidPasswordError ? 'Current passcode is incorrect' : (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ backup

function KeyringBackup({ k }: { k: KeyringMeta }) {
  const reveal = useWallet((s) => s.revealSecret);
  const markBackedUp = useWallet((s) => s.markBackedUp);
  const [ask, setAsk] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [verifying, setVerifying] = useState(false);
  useEffect(() => () => setPhrase(''), []);

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium">
            {k.label} {k.backedUp ? <Badge tone="up">Backed up</Badge> : <Badge tone="warn">Not backed up</Badge>}
          </p>
          <p className="text-sm text-mist-400">BIP-39 recovery phrase · created {new Date(k.createdAt).toLocaleDateString()}</p>
        </div>
        <Button size="sm" onClick={() => setAsk(true)} data-testid="reveal-phrase">
          <Eye className="h-4 w-4" /> Reveal
        </Button>
      </div>
      <PasswordPrompt
        open={ask}
        onOpenChange={setAsk}
        title="Reveal recovery phrase"
        description="Make sure no one can see your screen."
        confirmLabel="Reveal"
        onConfirm={async (pw) => {
          const s = await reveal(pw, k.id);
          if (s.type === 'mnemonic') setPhrase(s.mnemonic);
          setAsk(false);
        }}
      />
      <Modal
        open={!!phrase}
        onOpenChange={(v) => {
          if (!v) {
            setPhrase('');
            setVerifying(false);
          }
        }}
        title={verifying ? 'Verify your backup' : 'Recovery phrase'}
        className="sm:max-w-xl"
      >
        {verifying ? (
          <PhraseVerify
            phrase={phrase}
            onVerified={() => {
              markBackedUp(k.id);
              toast.success('Backup verified');
              setPhrase('');
              setVerifying(false);
            }}
          />
        ) : (
          <div className="space-y-4">
            <Notice tone="danger" title="Never share these words">
              Anyone with this phrase controls every account derived from it. Nocta will never ask for it.
            </Notice>
            <PhraseGrid phrase={phrase} />
            <Button variant="primary" block onClick={() => setVerifying(true)}>
              {k.backedUp ? 'Re-verify my backup' : 'I’ve written it down — verify'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function BackupSection() {
  const keyrings = useWallet((s) => s.keyrings);
  const accounts = useWallet((s) => s.accounts);
  const revealKey = useWallet((s) => s.revealPrivateKey);
  const { copy } = useClipboard();
  const [target, setTarget] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => () => setKey(''), []);

  return (
    <div className="space-y-5">
      <SettingsCard title="Recovery phrases" desc="Your recovery phrase restores all accounts derived from it, in any standard Solana wallet.">
        {keyrings.filter((k) => k.type === 'mnemonic').map((k) => (
          <KeyringBackup key={k.id} k={k} />
        ))}
        {!keyrings.some((k) => k.type === 'mnemonic') && <p className="py-4 text-sm text-mist-400">No recovery phrases — this wallet uses imported private keys only.</p>}
      </SettingsCard>

      <SettingsCard title="Export private key" desc="For advanced use. A private key controls one account only.">
        {accounts.map((a) => (
          <SettingRow key={a.id} title={a.name} desc={<span className="font-mono">{shortAddress(a.publicKey, 6)}</span>}>
            <Button size="sm" variant="ghost" onClick={() => setTarget(a.id)}>
              <KeyRound className="h-4 w-4" /> Export
            </Button>
          </SettingRow>
        ))}
      </SettingsCard>

      <PasswordPrompt
        open={!!target && !key}
        onOpenChange={(v) => !v && setTarget(null)}
        title="Export private key"
        description="Make sure no one can see your screen."
        confirmLabel="Show private key"
        onConfirm={async (pw) => setKey(await revealKey(pw, target!))}
      />
      <Modal
        open={!!key}
        onOpenChange={(v) => {
          if (!v) {
            setKey('');
            setTarget(null);
            setShow(false);
          }
        }}
        title="Private key"
      >
        <div className="space-y-4">
          <Notice tone="danger" title="Full control of this account">
            Anyone with this key can steal all funds in this account. Never paste it into websites or share it.
          </Notice>
          <div className="relative rounded-2xl border border-white/[0.08] bg-ink-850 p-4">
            <p className={`break-all font-mono text-sm ${show ? '' : 'select-none blur-sm'}`}>{key}</p>
            {!show && (
              <button onClick={() => setShow(true)} className="absolute inset-0 grid place-items-center text-sm font-semibold">
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800/90 px-4 py-2">
                  <ShieldAlert className="h-4 w-4" /> Tap to reveal
                </span>
              </button>
            )}
          </div>
          <Button block onClick={() => copy(key, { sensitive: true, label: 'Private key' })}>
            Copy to clipboard
          </Button>
        </div>
      </Modal>
    </div>
  );
}
