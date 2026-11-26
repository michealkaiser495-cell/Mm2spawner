import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/state/settings';
import { useWallet } from '@/state/wallet';

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/** Locks the wallet after N minutes of inactivity, including while the tab is hidden. */
export function useAutoLock() {
  const status = useWallet((s) => s.status);
  const lock = useWallet((s) => s.lock);
  const minutes = useSettings((s) => s.autoLockMinutes);
  const qc = useQueryClient();

  useEffect(() => {
    if (status !== 'unlocked') return;
    const limit = minutes * 60_000;
    let last = Date.now();
    let throttle = 0;
    const bump = () => {
      const now = Date.now();
      if (now - throttle > 1000) {
        throttle = now;
        last = now;
      }
    };
    const check = () => {
      if (Date.now() - last >= limit) {
        lock();
        qc.removeQueries();
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', check);
    const id = setInterval(check, 5_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', check);
      clearInterval(id);
    };
  }, [status, minutes, lock, qc]);
}
