import { useState } from 'react';
import { useWallet } from '@/state/wallet';
import { Button } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { PasswordInput } from './SetupParts';

/** Re-authentication gate for sensitive actions. Resolves only on a correct password. */
export function PasswordPrompt({
  open,
  onOpenChange,
  title = 'Confirm with password',
  description,
  confirmLabel = 'Confirm',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (password: string) => void | Promise<void>;
}) {
  const verify = useWallet((s) => s.verifyPassword);
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const close = (v: boolean) => {
    if (!v) {
      setPw('');
      setError(undefined);
    }
    onOpenChange(v);
  };

  return (
    <Modal open={open} onOpenChange={close} title={title} description={description}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            if (!(await verify(pw))) {
              setError('Incorrect password');
              return;
            }
            const p = pw;
            setPw('');
            await onConfirm(p);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus error={error} aria-label="Password" />
        <Button type="submit" variant="primary" block loading={busy} disabled={!pw}>
          {confirmLabel}
        </Button>
      </form>
    </Modal>
  );
}
