import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CrossmintProvider, CrossmintHostedCheckout } from '@crossmint/client-sdk-react-ui';
import { ArrowDownLeft, CreditCard, Droplets, ExternalLink, Settings2, ShieldCheck } from 'lucide-react';
import { CROSSMINT_MAX_USD, CROSSMINT_MIN_USD, crossmintDeliversTo, crossmintEnv, USDC_MINT_MAINNET, usdcTokenLocator } from '@/lib/crossmint';
import { NATIVE_MINT } from '@/lib/solana/balances';
import { NETWORKS } from '@/lib/solana/networks';
import { useNetwork } from '@/hooks/useNetwork';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, cn, Input, Notice } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { TokenButton, TokenPicker, type PickableToken } from '@/components/wallet/TokenPicker';

const PRESETS = [20, 50, 100, 250];

const USDC: PickableToken = {
  mint: USDC_MINT_MAINNET,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  verified: true,
  icon: 'https://static.datapi.jup.ag/token-icons/6c4e5669d2a438653105399865445682e4a6cb51e19e1e61dc97578cd27bb9b2.webp',
};

function BuyWithCrossmint({ clientKey }: { clientKey: string }) {
  const account = useActiveAccount()!;
  const receiptEmail = useSettings((s) => s.receiptEmail);
  const { config } = useNetwork();
  const portfolio = usePortfolio();
  const [amount, setAmount] = useState('50');
  const [token, setToken] = useState<PickableToken>(USDC);
  const [pickerOpen, setPickerOpen] = useState(false);
  const env = crossmintEnv(clientKey);
  const deliversTo = crossmintDeliversTo(clientKey);
  const n = Number(amount);
  const valid = Number.isFinite(n) && n >= CROSSMINT_MIN_USD && n <= CROSSMINT_MAX_USD;
  const networkMismatch = config.id !== deliversTo;

  const isUsdc = token.mint === USDC_MINT_MAINNET || token.symbol === 'USDC';
  // Staging settles on devnet with a test USDC mint, so only USDC is buyable in test mode.
  const stagingNonUsdc = env === 'staging' && !isUsdc;
  const tokenLocator = isUsdc ? usdcTokenLocator(clientKey) : `solana:${token.mint}`;

  // Buyable list: USDC + SOL + tokens you already hold; remote search covers the rest.
  const buyable = useMemo<PickableToken[]>(() => {
    const held = portfolio.assets
      .filter((a) => !a.isNative)
      .map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.name, icon: a.icon, decimals: a.decimals, verified: a.verified }));
    const sol: PickableToken = { mint: NATIVE_MINT, symbol: 'SOL', name: 'Solana', decimals: 9, verified: true, isNative: true };
    const seen = new Set([USDC.mint]);
    return [USDC, sol, ...held.filter((t) => !seen.has(t.mint) && (seen.add(t.mint), true))];
  }, [portfolio.assets]);

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Buy crypto</h2>
            <Badge tone={env === 'production' ? 'up' : 'warn'}>{env === 'production' ? 'Live' : 'Test mode'}</Badge>
          </div>
          <TokenIcon symbol={token.symbol} icon={token.icon} mint={token.mint} isNative={token.isNative} size={32} />
        </div>
        <p className="mt-1 text-sm text-mist-400">Pay with card or Apple Pay. Crypto is delivered to your Solana address by Crossmint.</p>

        <div className="mt-5">
          <span className="mb-1.5 block text-sm font-medium text-mist-300">Token to buy</span>
          <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-850/80 p-3 text-left hover:border-white/15" data-testid="buy-token">
            <TokenIcon symbol={token.symbol} icon={token.icon} mint={token.mint} isNative={token.isNative} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold">{token.name} {!token.verified && <Badge tone="warn">Unverified</Badge>}</span>
              <span className="block text-xs text-mist-400">{token.symbol}</span>
            </span>
            <TokenButton token={token} onClick={() => setPickerOpen(true)} className="pointer-events-none h-9" />
          </button>
        </div>

        <div className="mt-4">
          <Input label="Amount (USD)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="num text-lg" right={<span className="pr-1 text-sm font-semibold text-mist-400">USD</span>} />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(String(p))} className={cn('rounded-xl border py-2 text-sm font-semibold', Number(amount) === p ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.05]')}>
                ${p}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mist-400">You pay ${valid ? n.toFixed(2) : '0.00'} and receive {token.symbol} at the market rate (minus Crossmint’s fee, shown at checkout). Limit ${CROSSMINT_MAX_USD}/order without extra verification.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-mist-400">Deliver to</span>
            <span className="font-mono text-xs">{account.publicKey.slice(0, 6)}…{account.publicKey.slice(-6)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-mist-400">Network</span>
            <span>{NETWORKS[deliversTo].label}</span>
          </div>
        </div>

        {stagingNonUsdc && (
          <Notice tone="warn" className="mt-4">Test mode (staging key) can only buy <strong>USDC</strong>. Switch the token back to USDC, or add a production key to buy {token.symbol}.</Notice>
        )}
        {networkMismatch && (
          <Notice tone="warn" className="mt-4">
            This {env} key delivers on <strong>{NETWORKS[deliversTo].short}</strong>, but Nocta is showing {config.short}. Your crypto will arrive at the same address; switch to {NETWORKS[deliversTo].short} to see it.
          </Notice>
        )}

        <div className="mt-5">
          {valid && !stagingNonUsdc ? (
            <CrossmintProvider apiKey={clientKey}>
              <CrossmintHostedCheckout
                className="accent-gradient inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-ink-950 transition-all hover:brightness-110"
                recipient={{ walletAddress: account.publicKey }}
                lineItems={{ tokenLocator, executionParameters: { mode: 'exact-in', amount: String(n) } }}
                payment={{ fiat: { enabled: true }, crypto: { enabled: false }, defaultMethod: 'fiat', ...(receiptEmail ? { receiptEmail } : {}) }}
                appearance={{ display: 'popup' }}
              >
                <CreditCard className="h-5 w-5" /> Buy ${valid ? n : 0} of {token.symbol}
              </CrossmintHostedCheckout>
            </CrossmintProvider>
          ) : (
            <Button variant="primary" size="lg" block disabled>
              {stagingNonUsdc ? 'Switch to USDC for test mode' : n > CROSSMINT_MAX_USD ? `Max $${CROSSMINT_MAX_USD} per order` : `Enter at least $${CROSSMINT_MIN_USD}`}
            </Button>
          )}
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-mist-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Payment is handled on Crossmint’s secure checkout. Nocta never sees your card.
        </p>
        {env === 'staging' && <p className="mt-1 text-center text-[11px] text-mist-400">Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC. No real money is charged.</p>}
      </Card>
      <TokenPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={buyable}
        remoteSearch
        title="Choose a token to buy"
        onSelect={(t) => setToken(t.mint === NATIVE_MINT ? { ...t, isNative: true } : t)}
      />
    </div>
  );
}

function CrossmintSetup() {
  const navigate = useNavigate();
  return (
    <Card className="p-6">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/[0.05]">
        <CreditCard className="h-7 w-7 text-accent" />
      </span>
      <h2 className="mt-4 text-center font-display text-xl font-bold">Set up card purchases</h2>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm text-mist-400">
        Buying with a card is powered by <strong>Crossmint</strong>. Add your Crossmint <strong>client key</strong> (<span className="font-mono">ck_…</span>) to enable it. It stays on this device.
      </p>
      <ol className="mx-auto mt-5 max-w-sm space-y-2 text-sm text-mist-300">
        <li>1. Create a free account at <a href="https://crossmint.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">crossmint.com</a>.</li>
        <li>2. Make a <strong>client</strong> API key with the <span className="font-mono text-xs">orders.create</span> scope.</li>
        <li>3. Add your app’s URL as an allowed origin.</li>
        <li>4. Paste the <span className="font-mono">ck_…</span> key in Settings.</li>
      </ol>
      <Button variant="primary" block className="mt-6" onClick={() => navigate('/settings/buy')}>
        <Settings2 className="h-4 w-4" /> Add Crossmint key
      </Button>
      <Notice tone="warn" className="mt-4">Never paste a secret key (<span className="font-mono">sk_…</span>) into any app. Only the client key (<span className="font-mono">ck_…</span>) belongs in a wallet.</Notice>
    </Card>
  );
}

export function Buy() {
  const navigate = useNavigate();
  const { config } = useNetwork();
  const clientKey = useSettings((s) => s.crossmintClientKey);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Buy crypto" back="/" action={clientKey ? <Button size="sm" variant="ghost" onClick={() => navigate('/settings/buy')}><Settings2 className="h-4 w-4" /></Button> : undefined} />
      {clientKey ? <BuyWithCrossmint clientKey={clientKey} /> : <CrossmintSetup />}
      <div className="mt-4 space-y-2">
        {config.isTestnet && (
          <Button block onClick={() => navigate('/')}>
            <Droplets className="h-4 w-4" /> Or get free test SOL from the faucet
          </Button>
        )}
        <Link to="/receive" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium hover:bg-white/[0.1]">
          <ArrowDownLeft className="h-4 w-4" /> Or receive from an exchange
        </Link>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-mist-400">
        Powered by Crossmint <ExternalLink className="h-3 w-3" />
      </p>
    </div>
  );
}
