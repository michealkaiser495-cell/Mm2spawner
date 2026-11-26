import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '@/state/settings';

/**
 * Copy to clipboard. For sensitive values the clipboard is overwritten after the
 * configured delay (best-effort: only works while the page is focused).
 */
export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const clearAfter = useSettings((s) => s.clipboardClearSeconds);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string, opts?: { sensitive?: boolean; label?: string }) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        if (opts?.sensitive) {
          toast.warning(`${opts.label ?? 'Secret'} copied — clipboard clears in ${clearAfter}s`);
          clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            try {
              const current = await navigator.clipboard.readText().catch(() => text);
              if (current === text) await navigator.clipboard.writeText('');
            } catch {
              /* page not focused */
            }
          }, clearAfter * 1000);
        } else {
          toast.success(`${opts?.label ?? 'Copied'} to clipboard`);
        }
      } catch {
        toast.error('Clipboard unavailable — copy manually');
      }
    },
    [clearAfter],
  );
  return { copy, copied };
}
