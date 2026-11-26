import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { LogoMark } from '@/components/ui/Logo';
import { OnboardingLayout } from './OnboardingLayout';

export function Welcome() {
  const navigate = useNavigate();
  return (
    <OnboardingLayout>
      <div className="text-center">
        <div className="mx-auto mb-6 w-fit animate-pulse-ring rounded-[22px]">
          <LogoMark size={76} />
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight">Welcome to Nocta</h2>
        <p className="mx-auto mt-2 max-w-xs text-mist-400">Create a new wallet or bring an existing one. Starts on Solana Devnet for safe testing.</p>
      </div>
      <div className="mt-8 space-y-3">
        <Button variant="primary" size="lg" block onClick={() => navigate('/onboarding/create')}>
          <Plus className="h-5 w-5" /> Create a new wallet
        </Button>
        <Button size="lg" block onClick={() => navigate('/onboarding/import')}>
          <Download className="h-5 w-5" /> I already have a wallet
        </Button>
      </div>
      <p className="mt-8 text-center text-xs leading-relaxed text-mist-400">
        Nocta is non-custodial software. You alone control your keys and are responsible for keeping your recovery phrase safe.
      </p>
    </OnboardingLayout>
  );
}
