import { useId, useState } from 'react';
import { cn } from './primitives';

function SolLogo() {
  const gid = `solg-${useId().replace(/:/g, '')}`;
  return (
  <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
    <defs>
      <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#9945FF" />
        <stop offset="1" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="16" fill="#0b0d14" />
    <g fill={`url(#${gid})`}>
      <path d="M9.6 20.3a.6.6 0 0 1 .43-.18h13.5c.27 0 .4.32.21.51l-2.35 2.35a.6.6 0 0 1-.43.18H7.46a.3.3 0 0 1-.21-.51z" />
      <path d="M9.6 9.02a.62.62 0 0 1 .43-.18h13.5c.27 0 .4.32.21.51L21.4 11.7a.6.6 0 0 1-.43.18H7.46a.3.3 0 0 1-.21-.51z" />
      <path d="M21.4 14.62a.6.6 0 0 0-.43-.18H7.46a.3.3 0 0 0-.21.51l2.35 2.35c.11.11.27.18.43.18h13.5c.27 0 .4-.32.21-.51z" />
    </g>
  </svg>
  );
}

function hue(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function LtcLogo({ size }: { size: number }) {
  return (
    <span className="grid h-full w-full place-items-center rounded-full font-bold text-white" style={{ background: 'linear-gradient(135deg,#4e5a6b,#2b3340)', fontSize: size * 0.56 }} aria-hidden>
      Ł
    </span>
  );
}

/** Token logo with graceful fallback. Remote logos load with no referrer. */
export function TokenIcon({ symbol, icon, mint, size = 40, isNative, className }: { symbol: string; icon?: string; mint?: string; size?: number; isNative?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (isNative || (symbol === 'SOL' && mint === 'So11111111111111111111111111111111111111112'))
    return <span className={cn('inline-block shrink-0 overflow-hidden rounded-full', className)} style={style}><SolLogo /></span>;
  if (mint === 'litecoin' || (symbol === 'LTC' && !icon))
    return <span className={cn('inline-block shrink-0 overflow-hidden rounded-full', className)} style={style}><LtcLogo size={size} /></span>;
  const safeIcon = icon && /^https:\/\//.test(icon) ? icon : undefined;
  if (safeIcon && !failed)
    return (
      <img
        src={safeIcon}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-full bg-ink-700 object-cover', className)}
        style={style}
      />
    );
  const h = hue(mint ?? symbol);
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full font-display font-bold text-white/90', className)}
      style={{ ...style, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${h} 60% 45%), hsl(${(h + 50) % 360} 60% 30%))` }}
      aria-hidden
    >
      {(symbol || '?').slice(0, 2).toUpperCase()}
    </span>
  );
}
