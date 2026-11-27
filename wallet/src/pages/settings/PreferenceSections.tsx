import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { CURRENCIES } from '@/lib/api/coingecko';
import { getConnection, isValidRpcUrl, NETWORK_LIST, NETWORKS, type SolanaNetwork } from '@/lib/solana/networks';
import { friendlyError } from '@/lib/solana/errors';
import { ACCENTS, useSettings, type AccentId } from '@/state/settings';
import { useWallet } from '@/state/wallet';
import { Badge, Button, cn, Input, Notice, Segmented, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { crossmintEnv, DEFAULT_CROSSMINT_CLIENT_KEY, isValidClientKey } from '@/lib/crossmint';
import { NetworkDot, useSwitchNetwork } from '@/components/wallet/NetworkSelector';
import { SettingRow, SettingsCard } from './parts';

// ------------------------------------------------------------------ network

function RpcEditor({ id }: { id: SolanaNetwork }) {
  const rpc = useSettings((s) => s.rpc);
  const update = useSettings((s) => s.update);
  const qc = useQueryClient();
  const [value, setValue] = useState(rpc[id] ?? '');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>();
  const valid = !value || isValidRpcUrl(value);

  const test = async (url: string) => {
    setTesting(true);
    setResult(undefined);
    try {
      const c = getConnection(url);
      const [v, gh] = await Promise.all([c.getVersion(), c.getGenesisHash()]);
      const expected: Record<SolanaNetwork, string> = {
        'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
        devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
        testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
      };
      if (gh !== expected[id]) {
        setResult(`⚠ This endpoint is NOT ${NETWORKS[id].label} (genesis hash mismatch).`);
        return false;
      }
      setResult(`✓ Connected · Solana ${v['solana-core']}`);
      return true;
    } catch (e) {
      setResult(`✗ ${friendlyError(e)}`);
      return false;
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="py-4">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <NetworkDot network={id} /> {NETWORKS[id].label}
        {rpc[id] ? <Badge tone="accent">Custom</Badge> : <Badge>Default</Badge>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input value={value} onChange={(e) => setValue(e.target.value.trim())} placeholder={NETWORKS[id].defaultRpc} aria-label={`${NETWORKS[id].label} RPC URL`} error={!valid ? 'Must be an https:// URL' : undefined} className="font-mono text-xs" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => test(value || NETWORKS[id].defaultRpc)} disabled={!valid || testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
          <Button
            variant="primary"
            disabled={!valid || testing || value === (rpc[id] ?? '')}
            onClick={async () => {
              if (value && !(await test(value))) return;
              update({ rpc: { ...rpc, [id]: value || undefined } });
              qc.invalidateQueries();
              toast.success(value ? 'Custom RPC saved' : 'Reverted to default RPC');
            }}
          >
            Save
          </Button>
        </div>
      </div>
      {result && <p className={cn('mt-2 text-sm', result.startsWith('✓') ? 'text-up' : 'text-down')}>{result}</p>}
    </div>
  );
}

const FEE_LEVELS: { value: 'eco' | 'normal' | 'turbo'; label: string; desc: string }[] = [
  { value: 'eco', label: 'Eco', desc: 'Cheapest. 0 priority — base fee only.' },
  { value: 'normal', label: 'Normal', desc: 'Balanced speed and cost.' },
  { value: 'turbo', label: 'Turbo', desc: 'Fastest during congestion.' },
];

export function NetworkSection() {
  const network = useSettings((s) => s.network);
  const feeLevel = useSettings((s) => s.feeLevel);
  const update = useSettings((s) => s.update);
  const { request, dialog } = useSwitchNetwork();
  return (
    <div className="space-y-5">
      <SettingsCard title="Active network" desc="Testnets use worthless test tokens — ideal for development.">
        {NETWORK_LIST.map((n) => (
          <button key={n.id} onClick={() => n.id !== network && request(n.id)} className="flex w-full items-center gap-3 py-4 text-left">
            <NetworkDot network={n.id} className="h-2.5 w-2.5" />
            <span className="flex-1">
              <span className="block font-medium">{n.label}</span>
              <span className="block text-sm text-mist-400">{n.isTestnet ? 'Test environment' : 'Production · real assets'}</span>
            </span>
            {n.id === network && <Check className="h-5 w-5 text-accent" />}
          </button>
        ))}
      </SettingsCard>
      <SettingsCard title="Transaction fees" desc="Nocta charges no fees. You pay only Solana’s network cost (≈0.000005 SOL base) plus the priority fee you choose below.">
        <div className="py-3">
          <div className="grid grid-cols-3 gap-2">
            {FEE_LEVELS.map((f) => (
              <button
                key={f.value}
                onClick={() => update({ feeLevel: f.value })}
                aria-pressed={feeLevel === f.value}
                className={cn('rounded-xl border p-3 text-left transition-all', feeLevel === f.value ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] hover:bg-white/[0.05]')}
              >
                <span className="block font-semibold">{f.label}</span>
                <span className="mt-0.5 block text-xs text-mist-400">{f.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>
      <SettingsCard title="RPC endpoints" desc="Public endpoints are rate-limited. For reliable Mainnet use, add a dedicated provider URL (Helius, Triton, QuickNode…). Endpoints are verified by genesis hash.">
        {NETWORK_LIST.map((n) => (
          <RpcEditor key={n.id} id={n.id} />
        ))}
      </SettingsCard>
      <Notice>Ethereum and other EVM networks are planned. Nocta’s chain layer is modular, so additional networks can be added without touching your keys.</Notice>
      {dialog}
    </div>
  );
}

// ------------------------------------------------------------------ display

export function DisplaySection() {
  const s = useSettings();
  return (
    <div className="space-y-5">
      <SettingsCard title="Currency">
        <SettingRow title="Display currency" desc="Prices are converted from USD using CoinGecko rates.">
          <select
            aria-label="Display currency"
            value={s.currency}
            onChange={(e) => s.update({ currency: e.target.value as typeof s.currency })}
            className="h-10 rounded-xl border border-white/[0.08] bg-ink-850 px-3 text-sm uppercase outline-none focus:border-[var(--accent-from)]"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Theme">
        <div className="py-4">
          <p className="mb-3 font-medium">Accent</p>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button key={id} onClick={() => s.update({ accent: id })} className="flex flex-col items-center gap-1.5" aria-label={`${ACCENTS[id].label} accent`} aria-pressed={s.accent === id}>
                <span
                  className={cn('h-11 w-11 rounded-2xl ring-offset-2 ring-offset-[var(--surface-bg)] transition-all', s.accent === id ? 'ring-2 ring-white/80' : 'ring-0')}
                  style={{ background: `linear-gradient(135deg, ${ACCENTS[id].from}, ${ACCENTS[id].to})` }}
                />
                <span className="text-xs text-mist-400">{ACCENTS[id].label}</span>
              </button>
            ))}
          </div>
        </div>
        <SettingRow title="Surface" desc="OLED uses true black to save battery on OLED screens.">
          <Segmented size="sm" value={s.surface} onChange={(v) => s.update({ surface: v })} options={[{ value: 'dark', label: 'Midnight' }, { value: 'oled', label: 'OLED' }]} />
        </SettingRow>
        <SettingRow title="Reduce motion" desc="Minimise animations and transitions.">
          <Switch label="Reduce motion" checked={s.reduceMotion} onChange={(v) => s.update({ reduceMotion: v })} />
        </SettingRow>
        <SettingRow title="Light mode" desc="Nocta is designed dark-first. A light theme is not yet implemented.">
          <Badge>Not yet available</Badge>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

// ------------------------------------------------------------------ privacy

export function PrivacySection() {
  const s = useSettings();
  return (
    <div className="space-y-5">
      <SettingsCard title="Privacy">
        <SettingRow title="Hide balances" desc="Mask amounts across the app (tap the eye on Home to toggle).">
          <Switch label="Hide balances" checked={s.hideBalances} onChange={(v) => s.update({ hideBalances: v })} />
        </SettingRow>
        <SettingRow title="Hide zero balances" desc="Hide empty token accounts from your token list.">
          <Switch label="Hide zero balances" checked={s.hideZeroBalances} onChange={(v) => s.update({ hideZeroBalances: v })} />
        </SettingRow>
        <SettingRow title="Hide unverified tokens" desc="Hide airdropped/spam tokens Nocta can’t verify.">
          <Switch label="Hide unverified tokens" checked={s.hideUnverified} onChange={(v) => s.update({ hideUnverified: v })} />
        </SettingRow>
        <SettingRow title="Fetch market data" desc="Prices, charts, token metadata & swap quotes from Jupiter and CoinGecko.">
          <Switch label="Fetch market data" checked={s.fetchMarketData} onChange={(v) => s.update({ fetchMarketData: v })} />
        </SettingRow>
        <SettingRow title="Reference values on testnets" desc="Show test SOL valued at the Mainnet SOL price (clearly labelled).">
          <Switch label="Reference values on testnets" checked={s.testnetReferenceValues} onChange={(v) => s.update({ testnetReferenceValues: v })} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="What leaves your device">
        <div className="space-y-2 py-4 text-sm text-mist-300">
          <p>
            <span className="font-semibold text-mist-100">Never:</span> recovery phrases, private keys or your password.
          </p>
          <p>
            <span className="font-semibold text-mist-100">Your RPC provider</span> sees your public address and the transactions you submit — this is inherent to using a blockchain.
          </p>
          <p>
            <span className="font-semibold text-mist-100">Jupiter</span> receives token mint addresses (and your public address only when you request a swap transaction).
          </p>
          <p>
            <span className="font-semibold text-mist-100">CoinGecko</span> receives only generic price-history requests — no addresses.
          </p>
          <p>Nocta has no backend, analytics or tracking.</p>
        </div>
      </SettingsCard>
    </div>
  );
}

// ------------------------------------------------------------------ about

export function AboutSection() {
  const resetAll = useWallet((s) => s.resetAll);
  const resetSettings = useSettings((s) => s.reset);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="space-y-5">
      <SettingsCard title="Nocta Wallet">
        <SettingRow title="Version">
          <span className="font-mono text-sm text-mist-300">{__APP_VERSION__}</span>
        </SettingRow>
        <SettingRow title="Chains" desc="Solana — send, receive & swap · Bitcoin, Ethereum, Litecoin, Dogecoin & EVM L2s — receive" />
        <SettingRow title="Key derivation" desc="BIP-39 · SLIP-0010 ed25519 · m/44'/501'/n'/0'" />
        <SettingRow title="Vault encryption" desc="PBKDF2-SHA256 (600,000 iterations) → AES-256-GCM via WebCrypto" />
        <SettingRow title="Open-source libraries" desc="@solana/web3.js, @solana/spl-token, @scure/bip39, micro-key-producer, React, TanStack Query" />
        <SettingRow title="Solana Explorer">
          <a href="https://explorer.solana.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Open <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Danger zone">
        <SettingRow title="Remove wallet from this device" desc="Deletes your encrypted vault and settings. Requires your recovery phrase to restore.">
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" /> Reset
          </Button>
        </SettingRow>
      </SettingsCard>
      <Modal open={open} onOpenChange={setOpen} title="Remove wallet?">
        <div className="space-y-4 text-sm">
          <Notice tone="danger">Without your recovery phrase and private-key backups, your funds will be lost forever.</Notice>
          <Input label={<>Type <span className="font-mono text-mist-100">RESET</span> to confirm</>} value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            variant="danger"
            block
            disabled={text !== 'RESET'}
            onClick={() => {
              resetAll();
              resetSettings();
              qc.clear();
              navigate('/onboarding', { replace: true });
            }}
          >
            Remove wallet
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ buy (Crossmint)

export function BuySection() {
  const clientKey = useSettings((s) => s.crossmintClientKey);
  const receiptEmail = useSettings((s) => s.receiptEmail);
  const update = useSettings((s) => s.update);
  const [key, setKey] = useState(clientKey);
  const [email, setEmail] = useState(receiptEmail);
  const isSecret = key.trim().startsWith('sk_');
  const validClient = isValidClientKey(key.trim());
  const env = validClient ? crossmintEnv(key.trim()) : null;

  return (
    <div className="space-y-5">
      <SettingsCard title="Buy with card (Crossmint)" desc="Buying crypto with a card or Apple Pay is powered by Crossmint. Paste your Crossmint client key below — it is stored only on this device and never sent to Nocta.">
        <div className="py-3">
          <Input
            label="Crossmint client key"
            placeholder="ck_staging_… or ck_production_…"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            className="font-mono text-xs"
            error={key && isSecret ? 'That is a SECRET key. Never use sk_ keys in an app — use a client (ck_) key.' : key && !validClient ? 'Must be a Crossmint client key starting with ck_' : undefined}
            hint={validClient ? `Valid ${env} client key` : clientKey ? 'Invalid key' : `Leave blank to use the built-in ${crossmintEnv(DEFAULT_CROSSMINT_CLIENT_KEY)} test key. Paste a ck_production_ key for real purchases.`}
          />
          <Input label="Receipt email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" className="mt-3" hint="Crossmint sends purchase receipts here." />
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              disabled={(!!key && !validClient) || (key === clientKey && email === receiptEmail)}
              onClick={() => {
                update({ crossmintClientKey: validClient ? key.trim() : '', receiptEmail: email.trim() });
                toast.success(validClient ? 'Crossmint key saved' : 'Crossmint key cleared');
              }}
            >
              Save
            </Button>
            {clientKey && (
              <Button
                variant="danger"
                onClick={() => {
                  setKey('');
                  update({ crossmintClientKey: '' });
                  toast.success('Crossmint key removed');
                }}
              >
                Remove key
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>
      <Notice tone={isSecret ? 'danger' : 'info'} title={isSecret ? 'Do not use a secret key' : 'Which key?'}>
        Use the <span className="font-mono">ck_</span> <strong>client</strong> key (browser-safe, origin-restricted). Never paste an <span className="font-mono">sk_</span> secret key into any app — anyone could extract it and charge money.
      </Notice>
      <SettingsCard title="How Buy works">
        <div className="space-y-2 py-4 text-sm text-mist-300">
          <p>Card payments open <strong>Crossmint’s</strong> secure checkout (where Apple Pay appears). Nocta never sees your card details.</p>
          <p>Crossmint delivers <strong>USDC</strong> to your Solana address — on mainnet for a production key, on devnet for a staging (test) key.</p>
          <p>A <span className="font-mono">ck_staging_</span> key lets you test with card <span className="font-mono">4242 4242 4242 4242</span> and no real money.</p>
        </div>
      </SettingsCard>
    </div>
  );
}
