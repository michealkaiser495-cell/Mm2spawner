import { useId } from 'react';
import { cn } from './primitives';

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  // Unique gradient id: duplicate ids break when the first instance is display:none.
  const gid = `nocta-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-from)" />
          <stop offset="1" stopColor="var(--accent-to)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#0d1019" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="17.5" fill="none" stroke="rgba(255,255,255,0.08)" />
      <path d="M19 45V19l26 26V19" fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="45" cy="19" r="4" fill="var(--accent-from)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={32} />
      <span className="font-display text-xl font-bold tracking-tight">nocta</span>
    </span>
  );
}
