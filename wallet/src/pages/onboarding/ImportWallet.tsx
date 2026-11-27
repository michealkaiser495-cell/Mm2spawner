import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PublicKey } from '@solana/web3.js';
import { getConnection, NETWORKS } from '@/lib/solana/networks';
import { rpcUrlFor, useSettings } from '@/state/settings';
import { useWallet, type NewSecret } from '@/state/wallet';
import { PasswordSetup, Steps } from '@/components/wallet/SetupParts';
import { SecretImport } from '@/components/wallet/SecretImport';
import { OnboardingLayout } from './OnboardingLayout';

export function ImportWallet() {
  const navigate = useNavigate();
  const createVault = useWallet((s) => s.createVault);
  const discover = useWallet((s) => s.discoverAccounts);
  const [secret, setSecret] = useState<NewSecret | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async (password: string) => {
    if (!secret) return;
    setBusy(true);
    try {
      await createVault({ password, secret });
      setSecret(null);
      const { keyrings } = useWallet.getState();
      if (keyrings[0]?.type === 'mnemonic') {
        const s = useSettings.getState();
        const conn = getConnection(rpcUrlFor(s, s.network, NETWORKS[s.network].defaultRpc));
        const found = await discover(keyrings[0].id, async (pk) => (await conn.getSignaturesForAddress(new PublicKey(pk), { limit: 1 })).length > 0);
        if (found) toast.success(`Found ${found} additional account${found > 1 ? 's' : ''} with activity`);
      }
      toast.success('Wallet imported');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <OnboardingLayout back={secret ? () => setSecret(null) : '/onboarding'}>
      <Steps step={secret ? 1 : 0} total={2} />
      {!secret ? (
        <div className="mt-5">
          <h2 className="font-display text-2xl font-bold">Import a wallet</h2>
          <p className="mb-6 mt-1 text-sm text-mist-400">Validated and encrypted on this device. Never transmitted.</p>
          <SecretImport onSubmit={setSecret} />
        </div>
      ) : (
        <div className="mt-5">
          <h2 className="font-display text-2xl font-bold">Set a passcode</h2>
          <p className="mb-6 mt-1 text-sm text-mist-400">A number used to unlock Nocta on this device.</p>
          <PasswordSetup onSubmit={finish} submitLabel="Import wallet" loading={busy} />
        </div>
      )}
    </OnboardingLayout>
  );
}
