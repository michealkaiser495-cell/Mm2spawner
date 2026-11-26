/** Formatting & exact decimal math (amounts are handled as bigint base units). */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Parse a user-entered decimal string into base units. Returns null when invalid. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [whole = '0', frac = ''] = s.split('.');
  if (frac.length > decimals) return null;
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
  } catch {
    return null;
  }
}

/** Exact base-unit → decimal string, trimming trailing zeros. */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toString()}${frac ? '.' + frac : ''}`;
}

export function toNumber(value: bigint, decimals: number): number {
  return Number(formatUnits(value, decimals));
}

/** Human display of a token amount with sensible precision. */
export function formatAmount(n: number, maxFrac?: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = maxFrac ?? (abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 9);
  if (abs > 0 && abs < 1e-9) return n < 0 ? '-<0.000000001' : '<0.000000001';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

export function formatCompact(n: number | undefined | null, currency?: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
    ...(currency ? { style: 'currency', currency: currency.toUpperCase() } : {}),
  }).format(n);
}

export function formatFiat(n: number | undefined | null, currency = 'usd'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const maxFrac = abs > 0 && abs < 0.01 ? 6 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: currency === 'jpy' ? 0 : 2,
    maximumFractionDigits: currency === 'jpy' ? 0 : maxFrac,
  }).format(n);
}

export function formatPct(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function shortAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return addr.length <= chars * 2 + 3 ? addr : `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return 'Pending';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(unixSeconds * 1000),
  );
}

export function timeAgo(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return 'just now';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDateTime(unixSeconds);
}
