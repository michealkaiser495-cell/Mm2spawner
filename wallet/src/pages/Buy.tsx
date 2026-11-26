import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, CreditCard, Droplets } from 'lucide-react';
import { useNetwork } from '@/hooks/useNetwork';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, Notice } from '@/components/ui/primitives';

/**
 * Fiat on-ramp. Integrating a provider requires a commercial agreement and API keys,
 * so this screen states clearly that buying in-app is not yet implemented.
 */
export function Buy() {
  const navigate = useNavigate();
  const { config } = useNetwork();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Buy crypto" back="/" />
      <Card className="p-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/[0.05]">
          <CreditCard className="h-7 w-7 text-accent" />
        </span>
        <div className="mt-4 flex items-center justify-center gap-2">
          <h2 className="font-display text-xl font-bold">Card & bank purchases</h2>
          <Badge tone="warn">Not yet implemented</Badge>
        </div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mist-400">
          In-app purchases need a licensed on-ramp partner (e.g. MoonPay, Coinbase Onramp, Stripe). Nocta does not process payments yet, and no payment details are collected.
        </p>
        <div className="mt-6 space-y-2">
          {config.isTestnet ? (
            <Button variant="primary" block onClick={() => navigate('/')}>
              <Droplets className="h-4 w-4" /> Get free test SOL from the faucet
            </Button>
          ) : null}
          <Button block onClick={() => navigate('/receive')}>
            <ArrowDownLeft className="h-4 w-4" /> Receive from an exchange instead
          </Button>
        </div>
      </Card>
      <Notice className="mt-4">
        To fund your wallet today, buy SOL on a reputable exchange and withdraw it to your Nocta address on the Solana network.
      </Notice>
    </div>
  );
}
