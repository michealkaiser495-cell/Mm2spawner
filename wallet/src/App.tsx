import { useEffect, type ReactNode } from 'react';
import { createHashRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ACCENTS, useSettings } from './state/settings';
import { useWallet } from './state/wallet';
import { AppShell } from './components/layout/AppShell';
import { Welcome } from './pages/onboarding/Welcome';
import { CreateWallet } from './pages/onboarding/CreateWallet';
import { ImportWallet } from './pages/onboarding/ImportWallet';
import { Unlock } from './pages/Unlock';
import { Dashboard } from './pages/Dashboard';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { Buy } from './pages/Buy';
import { Swap } from './pages/Swap';
import { Explore } from './pages/Explore';
import { TokenDetail } from './pages/TokenDetail';
import { Activity } from './pages/Activity';
import { TxDetail } from './pages/TxDetail';
import { SettingsPage } from './pages/settings/SettingsPage';
import { NotFound } from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true, staleTime: 15_000, retry: 1 },
  },
});

function RestoringScreen() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="aurora-bg" />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent-from)]" aria-label="Loading" />
    </div>
  );
}

/** Routes only reachable with an unlocked wallet. */
function RequireUnlocked({ children }: { children: ReactNode }) {
  const status = useWallet((s) => s.status);
  const restoring = useWallet((s) => s.restoring);
  const loc = useLocation();
  if (status === 'empty') return <Navigate to="/onboarding" replace />;
  if (restoring) return <RestoringScreen />;
  if (status === 'locked') return <Navigate to="/unlock" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

/** Onboarding only when no wallet exists. */
function RequireEmpty({ children }: { children: ReactNode }) {
  const status = useWallet((s) => s.status);
  if (status === 'locked') return <Navigate to="/unlock" replace />;
  if (status === 'unlocked') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireLocked({ children }: { children: ReactNode }) {
  const status = useWallet((s) => s.status);
  const restoring = useWallet((s) => s.restoring);
  if (status === 'empty') return <Navigate to="/onboarding" replace />;
  if (restoring) return <RestoringScreen />;
  if (status === 'unlocked') return <Navigate to="/" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  { path: '/onboarding', element: <RequireEmpty><Welcome /></RequireEmpty> },
  { path: '/onboarding/create', element: <RequireEmpty><CreateWallet /></RequireEmpty> },
  { path: '/onboarding/import', element: <RequireEmpty><ImportWallet /></RequireEmpty> },
  { path: '/unlock', element: <RequireLocked><Unlock /></RequireLocked> },
  {
    path: '/',
    element: (
      <RequireUnlocked>
        <AppShell />
      </RequireUnlocked>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'send', element: <Send /> },
      { path: 'receive', element: <Receive /> },
      { path: 'buy', element: <Buy /> },
      { path: 'swap', element: <Swap /> },
      { path: 'explore', element: <Explore /> },
      { path: 'explore/:mint', element: <TokenDetail /> },
      { path: 'activity', element: <Activity /> },
      { path: 'activity/:signature', element: <TxDetail /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function ThemeSync() {
  const accent = useSettings((s) => s.accent);
  const surface = useSettings((s) => s.surface);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    const root = document.documentElement;
    const a = ACCENTS[accent] ?? ACCENTS.aurora;
    root.style.setProperty('--accent-from', a.from);
    root.style.setProperty('--accent-to', a.to);
    root.dataset.surface = surface;
    root.dataset.reduceMotion = String(reduceMotion);
  }, [accent, surface, reduceMotion]);
  return null;
}

function SessionRestore() {
  const restoreSession = useWallet((s) => s.restoreSession);
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeSync />
        <SessionRestore />
        <RouterProvider router={router} />
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            className: '!bg-ink-800/95 !border !border-white/10 !text-mist-100 !rounded-2xl !backdrop-blur-xl',
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
