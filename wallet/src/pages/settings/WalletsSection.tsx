import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Copy, Download, KeyRound, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { createMnemonic } from '@/lib/crypto/keys';
import { shortAddress } from '@/lib/format';
import { useClipboard } from '@/hooks/useClipboard';
import { useActiveAccount, useWallet, type Account } from '@/state/wallet';
import { Badge, Button, Card, Input, Notice } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { AccountAvatar } from '@/components/wallet/AccountAvatar';
import { SecretImport } from '@/components/wallet/SecretImport';
import { PhraseGrid, PhraseVerify } from '@/components/wallet/SetupParts';

type AddMode = null | 'menu' | 'import' | 'new-phrase';

function AccountRow({ a }: { a: Account }) {
  const active = useActiveAccount();
  const setActive = useWallet((s) => s.setActiveAccount);
  const rename = useWallet((s) => s.renameAccount);
  const remove = useWallet((s) => s.removeAccount);
  const count = useWallet((s) => s.accounts.length);
  const kr = useWallet((s) => s.keyrings.find((k) => k.id === a.keyringId));
  const { copy } = useClipboard();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isActive = active?.id === a.id;

  return (
    <div className="flex items-center gap-3 py-3.5">
      <AccountAvatar address={a.publicKey} name={a.name} size={40} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              rename(a.id, name);
              setEditing(false);
              toast.success('Account renamed');
            }}
          >
            <input autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-850 px-2.5 text-sm outline-none focus:border-[var(--accent-from)]" aria-label="Account name" />
            <Button size="sm" type="submit" variant="primary" disabled={!name.trim()}>
              Save
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{a.name}</span>
            {isActive && <Badge tone="accent">Active</Badge>}
            {kr?.type === 'privateKey' && <Badge>Imported key</Badge>}
          </p>
        )}
        <button onClick={() => copy(a.publicKey, { label: 'Address' })} className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-mist-400 hover:text-mist-200">
          {shortAddress(a.publicKey, 6)} <Copy className="h-3 w-3" />
          {kr?.type === 'mnemonic' && <span className="font-sans">· {kr.label} #{(a.index ?? 0) + 1}</span>}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isActive && (
          <Button size="sm" variant="ghost" onClick={() => setActive(a.id)}>
            <Check className="h-4 w-4" /> <span className="hidden sm:inline">Switch</span>
          </Button>
        )}
        <button onClick={() => setEditing((v) => !v)} className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label={`Rename ${a.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
        <button disabled={count <= 1} onClick={() => setConfirmRemove(true)} className="rounded-lg p-2 text-mist-400 hover:bg-down/10 hover:text-down disabled:opacity-30" aria-label={`Remove ${a.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Modal open={confirmRemove} onOpenChange={setConfirmRemove} title={`Remove “${a.name}”?`}>
        <div className="space-y-4">
          <Notice tone="warn">
            {kr?.type === 'privateKey'
              ? 'This imported private key will be deleted from this device. Make sure you have a backup of it.'
              : 'The account is hidden from Nocta. It can be re-derived later from its recovery phrase.'}
          </Notice>
          <div className="flex gap-2">
            <Button block onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              block
              variant="danger"
              onClick={async () => {
                try {
                  await remove(a.id);
                  toast.success('Account removed');
                } catch (e) {
                  toast.error((e as Error).message);
                }
                setConfirmRemove(false);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function WalletsSection() {
  const [params, setParams] = useSearchParams();
  const accounts = useWallet((s) => s.accounts);
  const keyrings = useWallet((s) => s.keyrings);
  const derive = useWallet((s) => s.deriveNextAccount);
  const addKeyring = useWallet((s) => s.addKeyring);
  const [mode, setMode] = useState<AddMode>(null);
  const [busy, setBusy] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [phraseStep, setPhraseStep] = useState<'show' | 'verify'>('show');
  const [name, setName] = useState('');
  const mnemonicKeyrings = keyrings.filter((k) => k.type === 'mnemonic');

  useEffect(() => {
    if (params.get('add')) {
      setMode('menu');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const close = () => {
    setMode(null);
    setNewPhrase('');
    setPhraseStep('show');
    setName('');
  };

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Accounts</h2>
            <p className="text-sm text-mist-400">{accounts.length} account{accounts.length === 1 ? '' : 's'} · {keyrings.length} key source{keyrings.length === 1 ? '' : 's'}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setMode('menu')} data-testid="add-account">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="mt-2 divide-y divide-white/[0.05]">
          {accounts.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </div>
      </Card>

      <Modal open={mode === 'menu'} onOpenChange={(v) => !v && close()} title="Add account">
        <div className="space-y-2">
          <Input label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder={`Account ${accounts.length + 1}`} />
          <div className="pt-2" />
          {mnemonicKeyrings.map((k) => (
            <button key={k.id} disabled={busy} onClick={() => run(() => derive(k.id, name), 'New account created')} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left hover:bg-white/[0.06]" data-testid="derive-account">
              <Sparkles className="h-5 w-5 text-accent" />
              <span>
                <span className="block font-semibold">New account</span>
                <span className="block text-xs text-mist-400">Derived from {k.label} — covered by the same backup</span>
              </span>
            </button>
          ))}
          <button
            onClick={() => {
              setNewPhrase(createMnemonic(12));
              setMode('new-phrase');
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left hover:bg-white/[0.06]"
          >
            <KeyRound className="h-5 w-5 text-accent" />
            <span>
              <span className="block font-semibold">New recovery phrase</span>
              <span className="block text-xs text-mist-400">A separate wallet with its own backup</span>
            </span>
          </button>
          <button onClick={() => setMode('import')} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left hover:bg-white/[0.06]">
            <Download className="h-5 w-5 text-accent" />
            <span>
              <span className="block font-semibold">Import wallet</span>
              <span className="block text-xs text-mist-400">Recovery phrase or private key</span>
            </span>
          </button>
        </div>
      </Modal>

      <Modal open={mode === 'import'} onOpenChange={(v) => !v && close()} title="Import wallet" description="Encrypted locally with your current password.">
        <SecretImport loading={busy} submitLabel="Import" onSubmit={(s) => run(() => addKeyring(s, name), 'Wallet imported')} />
      </Modal>

      <Modal open={mode === 'new-phrase'} onOpenChange={(v) => !v && close()} title="New recovery phrase" className="sm:max-w-xl">
        {newPhrase &&
          (phraseStep === 'show' ? (
            <div className="space-y-4">
              <Notice tone="warn">Write these words down in order. This phrase is separate from your existing backup.</Notice>
              <PhraseGrid phrase={newPhrase} />
              <Button variant="primary" block onClick={() => setPhraseStep('verify')}>
                I’ve written it down
              </Button>
            </div>
          ) : (
            <PhraseVerify phrase={newPhrase} onVerified={() => run(() => addKeyring({ type: 'mnemonic', mnemonic: newPhrase, backedUp: true }, name), 'New wallet created')} />
          ))}
      </Modal>
    </div>
  );
}
