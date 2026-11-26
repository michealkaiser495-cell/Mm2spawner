import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, RefreshCw, Settings2, ShieldAlert } from 'lucide-react';
import { getQuote, NATIVE_SOL_INFO } from '@/lib/api/jupiter';
import { prepareSwap } from '@/lib/solana/swap';
import { signAndSend, type PreparedTransaction, type TxPhase } from '@/lib/solana/transactions';
import { friendlyError } from '@/lib/solana/errors';
import { NATIVE_MINT } from '@/lib/solana/balances';
import { formatAmount, formatUnits, parseUnits, toNumber } from '@/lib/format';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useNetwork } from '@/hooks/useNetwork';
import { useFiat } from '@/hooks/useFiat';
import { useSettings } from '@/state/settings';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, cn, Notice, Row } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { TokenButton, TokenPicker, type PickableToken } from '@/components/wallet/TokenPicker';
import { TxSafetyPanel, TxStatus, feeLine } from '@/components/wallet/TxParts';
import { PasswordPrompt } from '@/components/wallet/PasswordPrompt';
import { useSwitchNetwork } from '@/components/wallet/NetworkSelector';

const SOL: PickableToken = { mint: NATIVE_MINT, symbol: 'SOL', name: 'Solana', decimals: 9, verified: true, isNative: true };
const USDC: PickableToken = {
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  verified: true,
  icon: 'https://static.datapi.jup.ag/token-icons/6c4e5669d2a438653105399865445682e4a6cb51e19e1e61dc97578cd27bb9b2.webp',
};
const SLIPPAGE_PRESETS = [10, 50, 100, 300];
const QUOTE_REFRESH_MS = 15_000;

function useDebounced<T>(v: T, ms = 450) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function Swap() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const account = useActiveAccount();
  const getKeypair = useWallet((s) => s.getKeypair);
  const { conn, network, config } = useNetwork();
  const { fmt } = useFiat();
  const p = usePortfolio();
  const slippageBps = useSettings((s) => s.slippageBps);
  const requirePw = useSettings((s) => s.requirePasswordToSign);
  const fetchMarketData = useSettings((s) => s.fetchMarketData);
  const feeLevel = useSettings((s) => s.feeLevel);
  const update = useSettings((s) => s.update);
  const { request: switchNetwork, dialog: switchDialog } = useSwitchNetwork();

  const [from, setFrom] = useState<PickableToken>(SOL);
  const [to, setTo] = useState<PickableToken>(USDC);
  const [amountStr, setAmountStr] = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [customSlip, setCustomSlip] = useState('');
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [impactAck, setImpactAck] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [status, setStatus] = useState<{ phase: TxPhase; sig?: string; error?: string } | null>(null);
  const inFlight = useRef(false);

  const holdings = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of p.assets) m.set(a.mint, a.uiAmount);
    return m;
  }, [p.assets]);
  const holdingTokens: PickableToken[] = useMemo(
    () =>
      config.hasMarketData
        ? p.assets.filter((a) => a.amount > 0n).map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.name, icon: a.icon, decimals: a.decimals, verified: a.verified, balance: a.uiAmount, isNative: a.isNative }))
        : [SOL, USDC],
    [p.assets, config.hasMarketData],
  );

  const fromAsset = p.assets.find((a) => a.mint === from.mint);
  const balance = config.hasMarketData ? fromAsset?.amount ?? 0n : undefined;
  const amount = parseUnits(amountStr, from.decimals);
  const debouncedAmount = useDebounced(amount);
  const insufficient = balance != null && amount != null && amount > balance;

  const quote = useQuery({
    queryKey: ['quote', from.mint, to.mint, debouncedAmount?.toString(), slippageBps],
    queryFn: ({ signal }) => getQuote({ inputMint: from.mint, outputMint: to.mint, amount: debouncedAmount!, slippageBps, signal }),
    enabled: fetchMarketData && !!debouncedAmount && debouncedAmount > 0n && from.mint !== to.mint,
    refetchInterval: reviewOpen ? false : QUOTE_REFRESH_MS,
    staleTime: 5_000,
    retry: 1,
  });
  const q = quote.data;
  const outAmount = q ? BigInt(q.outAmount) : undefined;
  const minOut = q ? BigInt(q.otherAmountThreshold) : undefined;
  const impactPct = q ? Number(q.priceImpactPct) * 100 : undefined;
  const rate = q && amount ? toNumber(BigInt(q.outAmount), to.decimals) / toNumber(BigInt(q.inAmount), from.decimals) : undefined;
  const highImpact = (impactPct ?? 0) > 5;
  const route = q?.routePlan.map((r) => r.swapInfo.label).filter(Boolean).join(' → ');

  useEffect(() => {
    setPrepared(null);
    setAck(false);
    setImpactAck(false);
  }, [q]);

  const fromPrice = fromAsset?.priceUsd;
  const inUsd = amount && fromPrice ? toNumber(amount, from.decimals) * fromPrice : undefined;

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmountStr('');
  };

  const setMax = () => {
    if (balance == null) return;
    const reserve = from.isNative ? 10_000_000n : 0n; // keep 0.01 SOL for fees/rent of new token accounts
    setAmountStr(formatUnits(balance > reserve ? balance - reserve : 0n, from.decimals));
  };

  const openReview = async () => {
    if (!q || !account) return;
    setPreparing(true);
    setPrepareError(undefined);
    try {
      const prep = await prepareSwap(conn, q, account.publicKey, feeLevel);
      setPrepared(prep);
      setReviewOpen(true);
    } catch (e) {
      setPrepareError(friendlyError(e));
    } finally {
      setPreparing(false);
    }
  };

  const execute = async () => {
    if (!prepared || !account || inFlight.current) return;
    inFlight.current = true;
    setReviewOpen(false);
    setStatus({ phase: 'signing' });
    let kp;
    try {
      kp = getKeypair(account.id);
      await signAndSend(conn, prepared, kp, (phase, sig) => setStatus((s) => ({ ...s, phase, sig: sig ?? s?.sig })));
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      setStatus((s) => ({ phase: 'failed', sig: (e as { signature?: string }).signature ?? s?.sig, error: friendlyError(e) }));
    } finally {
      kp?.secretKey.fill(0);
      inFlight.current = false;
    }
  };

  if (status)
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-6">
          <TxStatus
            phase={status.phase}
            signature={status.sig}
            error={status.error}
            network={network}
            title="Swap complete"
            onDone={() => navigate('/')}
            onRetry={() => {
              setStatus(null);
              setPrepared(null);
              quote.refetch();
            }}
          />
        </Card>
      </div>
    );

  const canReview = config.hasMarketData && !!q && !quote.isFetching && !insufficient && !preparing && amount === debouncedAmount;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Swap"
        subtitle="Best-price routing via Jupiter"
        action={
          <Button size="sm" variant="ghost" onClick={() => setSlipOpen(true)} aria-label="Slippage settings">
            <Settings2 className="h-4 w-4" /> {(slippageBps / 100).toFixed(slippageBps % 100 ? 1 : 0)}%
          </Button>
        }
      />
      {!config.hasMarketData && (
        <Notice tone="warn" className="mb-4" title="Swaps run on Mainnet only">
          Jupiter liquidity exists on Mainnet. Quotes below are live Mainnet previews; executing is disabled on {config.short}.
          <button onClick={() => switchNetwork('mainnet-beta')} className="ml-1 font-semibold underline underline-offset-2">
            Switch to Mainnet
          </button>
        </Notice>
      )}
      {!fetchMarketData && <Notice tone="warn" className="mb-4">Market data is disabled in Privacy settings, so quotes can’t be fetched.</Notice>}

      <Card className="p-3 sm:p-4">
        <div className="rounded-2xl bg-ink-850/70 p-4">
          <div className="mb-2 flex items-center justify-between text-sm text-mist-400">
            <span>You pay</span>
            {balance != null && (
              <button onClick={setMax} className="font-medium hover:text-mist-200">
                Balance: {formatAmount(toNumber(balance, from.decimals))} <span className="font-bold text-accent">MAX</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              aria-label="Amount to swap"
              className="num min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none placeholder:text-mist-400/50"
              data-testid="swap-amount"
            />
            <TokenButton token={from} onClick={() => setPicker('from')} />
          </div>
          <p className={cn('mt-1 h-5 text-sm', insufficient ? 'text-down' : 'text-mist-400')}>{insufficient ? 'Insufficient balance' : inUsd != null ? `≈ ${fmt(inUsd, { ignoreHide: true })}` : amountStr && amount == null ? 'Invalid amount' : ''}</p>
        </div>

        <div className="relative z-10 -my-3 flex justify-center">
          <button onClick={flip} className="grid h-10 w-10 place-items-center rounded-xl border-4 border-[var(--surface-bg)] bg-ink-700 text-mist-200 transition-transform hover:rotate-180" aria-label="Flip tokens">
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-ink-850/70 p-4">
          <div className="mb-2 flex items-center justify-between text-sm text-mist-400">
            <span>You receive</span>
            {holdings.get(to.mint) != null && <span>Balance: {formatAmount(holdings.get(to.mint)!)}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className={cn('num min-w-0 flex-1 truncate text-3xl font-semibold', !outAmount && 'text-mist-400/50', quote.isFetching && 'opacity-60')} data-testid="swap-out">
              {outAmount != null ? formatAmount(toNumber(outAmount, to.decimals)) : '0'}
            </div>
            <TokenButton token={to} onClick={() => setPicker('to')} />
          </div>
          {!to.verified && <p className="mt-2 text-xs text-warn">Unverified token — information could not be verified. Confirm the mint address before swapping.</p>}
        </div>

        {quote.isError && (
          <div className="mt-3">
            <Notice tone="danger" title="No quote">
              {friendlyError(quote.error)}
            </Notice>
          </div>
        )}

        {q && (
          <div className="mt-3 divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] px-4">
            <Row label="Rate">
              <span className="inline-flex items-center gap-2">
                1 {from.symbol} ≈ {formatAmount(rate ?? 0)} {to.symbol}
                <button onClick={() => quote.refetch()} aria-label="Refresh quote" className="text-mist-400 hover:text-mist-100">
                  <RefreshCw className={cn('h-3.5 w-3.5', quote.isFetching && 'animate-spin')} />
                </button>
              </span>
            </Row>
            <Row label="Price impact">
              <span className={cn((impactPct ?? 0) > 1 ? ((impactPct ?? 0) > 5 ? 'text-down' : 'text-warn') : 'text-up')}>{impactPct != null ? (impactPct < 0.01 ? '<0.01%' : `${impactPct.toFixed(2)}%`) : '—'}</span>
            </Row>
            <Row label="Minimum received">
              {minOut != null ? `${formatAmount(toNumber(minOut, to.decimals))} ${to.symbol}` : '—'}
            </Row>
            <Row label="Slippage tolerance">{slippageBps / 100}%</Row>
            <Row label="Network fee">{prepared ? feeLine(prepared) : <span className="text-mist-400">Estimated at review · ~0.00001–0.001 SOL</span>}</Row>
            {route && <Row label="Route"><span className="text-xs text-mist-300">{route}</span></Row>}
          </div>
        )}

        {prepareError && <Notice tone="danger" className="mt-3" title="Couldn't build swap">{prepareError}</Notice>}

        <Button variant="primary" size="lg" block className="mt-4" disabled={!canReview} loading={preparing} onClick={openReview} data-testid="swap-review">
          {!config.hasMarketData ? `Swaps unavailable on ${config.short}` : !amount ? 'Enter an amount' : insufficient ? 'Insufficient balance' : quote.isFetching && !q ? 'Fetching best price…' : 'Review swap'}
        </Button>
        <p className="mt-3 text-center text-[11px] text-mist-400">Quotes refresh every {QUOTE_REFRESH_MS / 1000}s. Nocta charges no swap fee. Routing by Jupiter.</p>
      </Card>

      {/* Review */}
      <Modal open={reviewOpen && !!prepared} onOpenChange={setReviewOpen} title="Review swap" description="Simulated and inspected locally before signing.">
        {prepared && q && amount != null && outAmount != null && minOut != null && (
          <div className="space-y-4">
            <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
              <Row label="You pay">
                <span className="num">{formatAmount(toNumber(amount, from.decimals))} {from.symbol}</span>
              </Row>
              <Row label="You receive (est.)">
                <span className="num text-up">{formatAmount(toNumber(outAmount, to.decimals))} {to.symbol}</span>
              </Row>
              <Row label="Minimum received">
                <span className="num">{formatAmount(toNumber(minOut, to.decimals))} {to.symbol}</span>
              </Row>
              <Row label="Price impact">{impactPct != null ? `${impactPct.toFixed(2)}%` : '—'}</Row>
              <Row label="Slippage">{slippageBps / 100}%</Row>
              <Row label="Network fee">{feeLine(prepared)}</Row>
              <Row label="Network">
                {config.label} <Badge tone="warn">Real funds</Badge>
              </Row>
            </div>
            <TxSafetyPanel prepared={prepared} />
            {highImpact && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-down/30 bg-down/[0.08] p-3 text-sm text-down">
                <input type="checkbox" checked={impactAck} onChange={(e) => setImpactAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
                Price impact is above 5%. I accept I may receive significantly less value.
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-mist-300">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-from)]" />
              I approve this swap. I understand the final amount may vary down to the minimum received.
            </label>
            <Button
              variant="primary"
              size="lg"
              block
              disabled={prepared.guard.blocked || prepared.errors.length > 0 || !ack || (highImpact && !impactAck)}
              onClick={() => (requirePw ? setPwOpen(true) : execute())}
            >
              <ShieldAlert className="h-4 w-4" /> Confirm swap
            </Button>
          </div>
        )}
      </Modal>

      {/* Slippage */}
      <Modal open={slipOpen} onOpenChange={setSlipOpen} title="Slippage tolerance" description="Maximum price movement you accept between quote and execution.">
        <div className="grid grid-cols-4 gap-2">
          {SLIPPAGE_PRESETS.map((bps) => (
            <button key={bps} onClick={() => update({ slippageBps: bps })} className={cn('rounded-xl border py-2.5 text-sm font-semibold', slippageBps === bps ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.05]')}>
              {bps / 100}%
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={customSlip} onChange={(e) => setCustomSlip(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Custom %" className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-ink-850 px-3 text-sm outline-none focus:border-[var(--accent-from)]" />
          <Button
            onClick={() => {
              const v = Number(customSlip);
              if (v > 0 && v <= 50) update({ slippageBps: Math.round(v * 100) });
            }}
            disabled={!(Number(customSlip) > 0 && Number(customSlip) <= 50)}
          >
            Set
          </Button>
        </div>
        {slippageBps > 300 && <Notice tone="warn" className="mt-3">High slippage makes you a target for front-running (sandwich attacks).</Notice>}
      </Modal>

      <TokenPicker
        open={picker !== null}
        onOpenChange={(v) => !v && setPicker(null)}
        tokens={picker === 'from' ? holdingTokens : [SOL, USDC, ...holdingTokens.filter((t) => t.mint !== SOL.mint && t.mint !== USDC.mint)]}
        remoteSearch
        title={picker === 'from' ? 'Swap from' : 'Swap to'}
        onSelect={(t) => {
          const tok = t.mint === NATIVE_SOL_INFO.id ? SOL : t;
          if (picker === 'from') {
            if (tok.mint === to.mint) setTo(from);
            setFrom(tok);
            setAmountStr('');
          } else {
            if (tok.mint === from.mint) setFrom(to);
            setTo(tok);
          }
        }}
      />
      <PasswordPrompt
        open={pwOpen}
        onOpenChange={setPwOpen}
        title="Authorize swap"
        confirmLabel="Sign & swap"
        onConfirm={() => {
          setPwOpen(false);
          execute();
        }}
      />
      {switchDialog}
    </div>
  );
}
