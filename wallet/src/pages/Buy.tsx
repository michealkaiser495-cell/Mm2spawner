import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CrossmintProvider, CrossmintEmbeddedCheckout } from '@crossmint/client-sdk-react-ui';
import { ArrowDownLeft, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { CROSSMINT_MAX_USD, CROSSMINT_MIN_USD, crossmintDeliversTo, crossmintEnv, DEFAULT_CROSSMINT_CLIENT_KEY } from '@/lib/crossmint';
import { NETWORKS } from '@/lib/solana/networks';
import { useNetwork } from '@/hooks/useNetwork';
import { useSettings } from '@/state/settings';
import { useActiveAccount } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, cn, Input, Notice } from '@/components/ui/primitives';
import { TokenIcon } from '@/components/ui/TokenIcon';

const PRESETS = [20, 50, 100, 250];
const USDC_ICON = 'https://static.datapi.jup.ag/token-icons/6c4e5669d2a438653105399865445682e4a6cb51e19e1e61dc97578cd27bb9b2.webp';

interface Order {
  orderId: string;
  clientSecret: string;
}

function BuyWithCrossmint({ clientKey }: { clientKey: string }) {
  const account = useActiveAccount()!;
  const receiptEmail = useSettings((s) => s.receiptEmail);
  const update = useSettings((s) => s.update);
  const { config } = useNetwork();
  const [amount, setAmount] = useState('50');
  const [email, setEmail] = useState(receiptEmail);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [order, setOrder] = useState<Order | null>(null);

  const env = crossmintEnv(clientKey);
  const deliversTo = crossmintDeliversTo(clientKey);
  const n = Number(amount);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const amountOk = Number.isFinite(n) && n >= CROSSMINT_MIN_USD && n <= CROSSMINT_MAX_USD;
  const valid = amountOk && emailOk && !creating;
  const networkMismatch = config.id !== deliversTo;

  const createOrder = async () => {
    setCreating(true);
    setError(undefined);
    try {
      const res = await fetch('/.netlify/functions/crossmint-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: String(n), email: email.trim(), walletAddress: account.publicKey }),
      });
      if (res.status === 404) {
        setError('Card buying needs the Crossmint server function deployed. See HOSTING — meanwhile you can receive from an exchange below.');
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Could not start checkout.');
        return;
      }
      setOrder({ orderId: data.orderId, clientSecret: data.clientSecret });
    } catch {
      setError('Could not reach the checkout service.');
    } finally {
      setCreating(false);
    }
  };

  // Once the order exists, Crossmint's embedded checkout handles card / Apple Pay / Google Pay
  // and delivers the USDC to your Solana address.
  if (order) {
    return (
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-lg font-semibold">Pay ${n} for USDC</p>
          <button onClick={() => setOrder(null)} className="text-sm text-mist-400 hover:text-mist-100">Cancel</button>
        </div>
        <CrossmintProvider apiKey={clientKey}>
          <CrossmintEmbeddedCheckout
            orderId={order.orderId}
            clientSecret={order.clientSecret}
            payment={{ fiat: { enabled: true }, crypto: { enabled: false }, defaultMethod: 'fiat', receiptEmail: email.trim() }}
          />
        </CrossmintProvider>
        {env === 'staging' && <p className="mt-3 text-center text-[11px] text-mist-400">Test mode: card 4242 4242 4242 4242, any future expiry, any CVC. No real money is charged.</p>}
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Buy USDC</h2>
          <Badge tone={env === 'production' ? 'up' : 'warn'}>{env === 'production' ? 'Live' : 'Test mode'}</Badge>
        </div>
        <TokenIcon symbol="USDC" icon={USDC_ICON} mint="usdc" size={32} />
      </div>
      <p className="mt-1 text-sm text-mist-400">Pay with card or Apple Pay. USDC is delivered to your Solana address by Crossmint.</p>

      <div className="mt-5">
        <Input label="Amount (USD)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="num text-lg" right={<span className="pr-1 text-sm font-semibold text-mist-400">USD</span>} />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setAmount(String(p))} className={cn('rounded-xl border py-2 text-sm font-semibold', Number(amount) === p ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.05]')}>
              ${p}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-mist-400">You pay ${amountOk ? n.toFixed(2) : '0.00'} and receive ≈ {amountOk ? n.toFixed(2) : '0.00'} USDC (minus Crossmint’s fee). Limit ${CROSSMINT_MAX_USD}/order.</p>
      </div>

      <div className="mt-4">
        <Input
          label="Email (required)"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value.trim()); update({ receiptEmail: e.target.value.trim() }); }}
          placeholder="you@example.com"
          error={email && !emailOk ? 'Enter a valid email' : undefined}
          hint="Crossmint sends your receipt here and links it to your wallet. Required."
        />
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

      {networkMismatch && (
        <Notice tone="warn" className="mt-4">
          This {env} key delivers on <strong>{NETWORKS[deliversTo].short}</strong>, but Nocta is showing {config.short}. Your USDC arrives at the same address; switch to {NETWORKS[deliversTo].short} to see it.
        </Notice>
      )}
      {error && <Notice tone="danger" className="mt-4" title="Can’t start checkout">{error}</Notice>}

      <Button variant="primary" size="lg" block className="mt-5" disabled={!valid} loading={creating} onClick={createOrder}>
        {creating ? 'Starting checkout…' : !amountOk ? (n > CROSSMINT_MAX_USD ? `Max $${CROSSMINT_MAX_USD}` : `Enter at least $${CROSSMINT_MIN_USD}`) : !emailOk ? 'Enter your email' : <><CreditCard className="h-5 w-5" /> Continue to payment</>}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-mist-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Payment is handled on Crossmint’s secure checkout. Nocta never sees your card.
      </p>
    </Card>
  );
}

export function Buy() {
  const clientKey = DEFAULT_CROSSMINT_CLIENT_KEY;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Buy crypto" back="/" />
      <BuyWithCrossmint clientKey={clientKey} />
      <div className="mt-4">
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
