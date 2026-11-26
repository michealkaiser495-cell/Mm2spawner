import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

export interface ChartPoint {
  t: number;
  v: number;
}

export function PriceChart({
  data,
  loading,
  error,
  format,
  height = 180,
  positive,
}: {
  data?: ChartPoint[];
  loading?: boolean;
  error?: string;
  format: (v: number) => string;
  height?: number;
  positive?: boolean;
}) {
  if (loading) return <div className="skeleton w-full" style={{ height }} aria-hidden />;
  if (error || !data || data.length < 2)
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-white/[0.08] text-sm text-mist-400" style={{ height }}>
        {error ?? 'Chart unavailable'}
      </div>
    );
  const up = positive ?? data[data.length - 1].v >= data[0].v;
  const color = up ? 'var(--color-up)' : 'var(--color-down)';
  const id = `grad-${up ? 'u' : 'd'}`;
  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-xl">
                  <p className="num text-sm font-semibold">{format(payload[0].payload.v)}</p>
                  <p className="text-mist-400">{new Date(payload[0].payload.t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive animationDuration={600} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
