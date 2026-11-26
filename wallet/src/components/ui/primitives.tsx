import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import clsx from 'clsx';
import { AlertTriangle, Info, Loader2, ShieldAlert } from 'lucide-react';

export const cn = clsx;

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'accent-gradient text-ink-950 font-semibold shadow-[0_10px_30px_-12px_var(--accent-from)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-white/[0.06] text-mist-100 border border-white/[0.08] hover:bg-white/[0.1]',
  ghost: 'text-mist-200 hover:bg-white/[0.06] hover:text-mist-100',
  outline: 'border border-white/15 text-mist-100 hover:border-white/30 hover:bg-white/[0.04]',
  danger: 'bg-down/15 text-down border border-down/30 hover:bg-down/25',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-13 px-6 text-base rounded-2xl gap-2',
  icon: 'h-10 w-10 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:saturate-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Card
export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' } & Record<string, unknown>) {
  return (
    <As className={cn('glass rounded-3xl', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-mist-400">{children}</h2>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ Badge
type Tone = 'neutral' | 'accent' | 'up' | 'down' | 'warn';
const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-mist-300 border-white/[0.08]',
  accent: 'bg-[color-mix(in_oklab,var(--accent-from)_14%,transparent)] text-accent border-[color-mix(in_oklab,var(--accent-from)_30%,transparent)]',
  up: 'bg-up/10 text-up border-up/25',
  down: 'bg-down/10 text-down border-down/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Loading
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-mist-400', className)} aria-label="Loading" />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

// ------------------------------------------------------------------ Inputs
interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  right?: ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, right, className, id, ...rest },
  ref,
) {
  const inputId = id ?? (typeof label === 'string' ? label.toLowerCase().replace(/\W+/g, '-') : undefined);
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-mist-300">{label}</span>}
      <span
        className={cn(
          'flex items-center rounded-xl border bg-ink-850/80 transition-colors focus-within:border-[var(--accent-from)]',
          error ? 'border-down/60' : 'border-white/[0.08]',
        )}
      >
        <input
          ref={ref}
          id={inputId}
          autoComplete="off"
          spellCheck={false}
          className={cn('h-12 w-full min-w-0 bg-transparent px-4 text-[15px] text-mist-100 outline-none placeholder:text-mist-400/70', className)}
          {...rest}
        />
        {right && <span className="pr-2">{right}</span>}
      </span>
      {error ? (
        <span className="mt-1.5 block text-[13px] text-down">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-mist-400">{hint}</span>
      ) : null}
    </label>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function TextArea(
  { label, hint, error, className, ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-mist-300">{label}</span>}
      <textarea
        ref={ref}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(
          'w-full resize-none rounded-xl border bg-ink-850/80 px-4 py-3 font-mono text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-400/70 focus:border-[var(--accent-from)]',
          error ? 'border-down/60' : 'border-white/[0.08]',
          className,
        )}
        {...rest}
      />
      {error ? <span className="mt-1.5 block text-[13px] text-down">{error}</span> : hint ? <span className="mt-1.5 block text-[13px] text-mist-400">{hint}</span> : null}
    </label>
  );
});

// ------------------------------------------------------------------ Switch
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border border-white/10 transition-colors',
        checked ? 'accent-gradient' : 'bg-white/10',
      )}
    >
      <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </RSwitch.Root>
  );
}

// ------------------------------------------------------------------ Segmented
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl border border-white/[0.06] bg-white/[0.03] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg font-semibold transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-white/[0.1] text-mist-100 shadow-sm' : 'text-mist-400 hover:text-mist-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ States
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05] text-mist-300">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-mist-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warn' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn(
        'flex gap-3 rounded-2xl border p-3.5 text-sm',
        tone === 'danger' && 'border-down/30 bg-down/[0.08] text-down',
        tone === 'warn' && 'border-warn/25 bg-warn/[0.07] text-warn',
        tone === 'info' && 'border-white/[0.08] bg-white/[0.03] text-mist-300',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(tone === 'info' ? 'text-mist-400' : 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="danger" title={title}>
      <span className="break-words">{error instanceof Error ? error.message : String(error)}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-2 font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </Notice>
  );
}

export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5 text-sm', className)}>
      <span className="shrink-0 text-mist-400">{label}</span>
      <span className="min-w-0 text-right font-medium text-mist-100">{children}</span>
    </div>
  );
}
