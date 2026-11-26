import { cn } from '../ui/primitives';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic, address-derived avatar (helps users notice the wrong account is active). */
export function AccountAvatar({ address, name, size = 32, className }: { address: string; name?: string; size?: number; className?: string }) {
  const h = hash(address);
  const a = h % 360;
  const b = (a + 40 + ((h >> 9) % 80)) % 360;
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full font-display font-bold text-white ring-1 ring-white/15', className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `conic-gradient(from ${h % 360}deg, hsl(${a} 75% 55%), hsl(${b} 70% 45%), hsl(${a} 75% 55%))` }}
      aria-hidden
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
