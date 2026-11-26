import { BadgeCheck, CircleHelp } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Badge } from '../ui/primitives';

/** Never labels a token "safe" — only whether its identity is listed as verified by a registry. */
export function VerifyBadge({ verified, source = 'Jupiter' }: { verified: boolean; source?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex">
          {verified ? (
            <Badge tone="accent">
              <BadgeCheck className="h-3 w-3" /> Verified
            </Badge>
          ) : (
            <Badge tone="warn">
              <CircleHelp className="h-3 w-3" /> Unverified
            </Badge>
          )}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="glass-strong z-50 max-w-60 rounded-xl px-3 py-2 text-xs text-mist-300 shadow-xl">
          {verified
            ? `Listed as verified by ${source}. Verification confirms identity, not safety or value — always do your own research.`
            : 'This token’s identity could not be verified. It may be an impersonation or scam token.'}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
