import { useMemo, useState } from 'react';
import { FileKey2, ScrollText } from 'lucide-react';
import { isValidMnemonic, normalizeMnemonic, parsePrivateKey, WORDLIST } from '@/lib/crypto/keys';
import { shortAddress } from '@/lib/format';
import type { NewSecret } from '@/state/wallet';
import { Button, Notice, Segmented, TextArea } from '../ui/primitives';

const WORDSET = new Set(WORDLIST);

/** Collects a recovery phrase or private key, validating locally. Nothing leaves the device. */
export function SecretImport({ onSubmit, submitLabel = 'Continue', loading }: { onSubmit: (s: NewSecret) => void; submitLabel?: string; loading?: boolean }) {
  const [mode, setMode] = useState<'phrase' | 'key'>('phrase');
  const [phrase, setPhrase] = useState('');
  const [key, setKey] = useState('');

  const phraseState = useMemo(() => {
    const norm = normalizeMnemonic(phrase);
    const words = norm ? norm.split(' ') : [];
    const bad = words.filter((w) => !WORDSET.has(w));
    const validCount = [12, 15, 18, 21, 24].includes(words.length);
    const valid = validCount && bad.length === 0 && isValidMnemonic(norm);
    let error: string | undefined;
    if (bad.length) error = `Not in the BIP-39 word list: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? '…' : ''}`;
    else if (words.length && !validCount && words.length > 11) error = `Recovery phrases have 12, 15, 18, 21 or 24 words (you entered ${words.length}).`;
    else if (validCount && !valid) error = 'Checksum mismatch — check the word order and spelling.';
    return { words, valid, error };
  }, [phrase]);

  const keyState = useMemo(() => {
    if (!key.trim()) return { valid: false as const };
    try {
      const kp = parsePrivateKey(key);
      const address = kp.publicKey.toBase58();
      kp.secretKey.fill(0);
      return { valid: true as const, address };
    } catch (e) {
      return { valid: false as const, error: (e as Error).message };
    }
  }, [key]);

  return (
    <div className="space-y-4">
      <Segmented
        className="w-full [&>button]:flex-1"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'phrase', label: <span className="inline-flex items-center gap-1.5"><ScrollText className="h-4 w-4" />Recovery phrase</span> },
          { value: 'key', label: <span className="inline-flex items-center gap-1.5"><FileKey2 className="h-4 w-4" />Private key</span> },
        ]}
      />
      {mode === 'phrase' ? (
        <>
          <TextArea
            label="Recovery phrase"
            rows={4}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Enter your 12 or 24 words separated by spaces"
            error={phraseState.error}
            hint={phraseState.words.length ? `${phraseState.words.length} words${phraseState.valid ? ' · valid phrase' : ''}` : 'Phrases are validated locally against the BIP-39 checksum.'}
            name="nocta-recovery-phrase"
            data-lpignore="true"
          />
          <Button variant="primary" size="lg" block disabled={!phraseState.valid} loading={loading} onClick={() => onSubmit({ type: 'mnemonic', mnemonic: phrase, backedUp: true })}>
            {submitLabel}
          </Button>
        </>
      ) : (
        <>
          <TextArea
            label="Private key"
            rows={3}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Base58 secret key, or a [..64 bytes..] JSON array"
            error={key.trim() && !keyState.valid ? keyState.error : undefined}
            hint={keyState.valid ? `Address: ${shortAddress(keyState.address!, 6)}` : 'Imported keys are not covered by your recovery phrase — back them up separately.'}
            name="nocta-private-key"
            data-lpignore="true"
          />
          <Notice tone="warn">Only import keys you control. Never paste a key someone else sent you — that is a common scam.</Notice>
          <Button variant="primary" size="lg" block disabled={!keyState.valid} loading={loading} onClick={() => onSubmit({ type: 'privateKey', secretKey: key })}>
            {submitLabel}
          </Button>
        </>
      )}
    </div>
  );
}
