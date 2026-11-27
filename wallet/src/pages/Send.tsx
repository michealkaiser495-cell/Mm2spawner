import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ClipboardPaste, QrCode, ShieldAlert } from 'lucide-react';
import { checkAddress } from '@/lib/solana/address';
import { friendlyError } from '@/lib/solana/errors';
import { prepareTransfer, signAndSend, type PreparedTransaction, type TransferAsset, type TxPhase } from '@/lib/solana/transactions';
import { formatAmount, formatUnits, parseUnits, shortAddress, toNumber } from '@/lib/format';
import { usePortfolio, type Asset } from '@/hooks/usePortfolio';
import { useNetwork } from '@/hooks/useNetwork';
import { useFiat } from '@/hooks/useFiat';
import { useHistory } from '@/hooks/useHistory';
import { useSettings } from '@/state/settings';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge, Button, Card, EmptyState, Input, Notice, Row, Skeleton } from '@/components/ui/primitives';
import { TokenButton, TokenPicker, type PickableToken } from '@/components/wallet/TokenPicker';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { TxSafetyPanel, TxStatus, feeLine } from '@/components/wallet/TxParts';
import { PasswordPrompt } from '@/components/wallet/PasswordPrompt';
import { QrScanner } from '@/components/wallet/QrScanner';

/** Remember recent submissions to catch accidental duplicates (in-memory only). */
const recentSends = new Map<string, number>();
const DUP_WINDOW_MS = 3 * 60_000;

/** SOL kept back by "Max" so the account stays rent-exempt and can pay future fees. */
const SOL_RESERVE = 1_000_000n; // 0.001 SOL (> rent-exempt minimum of ~0.00089 SOL)

function toPickable(a: Asset): PickableToken {
  return { mint: a.isNative ? 'SOL' : a.mint, symbol: a.symbol, name: a.name, icon: a.icon, decimals: a.decimals, verified: a.verified, balance: a.uiAmount, isNative: a.isNative };
}

type Step = 'form' | 'review' | 'status';

export function Send() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const account = useActiveAccount();
  const getKeypair = useWallet((s) => s.getKeypair);
  const requirePw = useSettings((s) => s.requirePasswordToSign);
  const feeLevel = useSettings((s) => s.feeLevel);
  const { conn, network, config } = useNetwork();
  const { fmt } = useFiat();
  const p = usePortfolio();
  const history = useHistory(20);

  const [step, setStep] = useState<Step>('form');
  const [assetKey, setAssetKey] = useState(params.get('mint') ?? 'SOL');
  const [recipient, setRecipient] = useState(params.get('to') ?? '');
  const [amountStr, setAmountStr] = useState('');
  const [usdMode, setUsdMode] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string>();
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);
  const [ack, setAck] = useState(false);
  const [dupAck, setDupAck] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [phase, setPhase] = useState<TxPhase>('signing');
  const [signature, setSignature] = useState<string>();
  const [sendError, setSendError] = useState<string>();
  const inFlight = useRef(false);

  const sendable = p.assets.filter((a) => a.amount > 0n);
  const asset = p.assets.find((a) => (assetKey === 'SOL' ? a.isNative : a.mint === assetKey)) ?? p.assets[0];

  const addr = useMemo(() => (recipient ? checkAddress(recipient) : null), [recipient]);
  // USD mode: the field is a dollar amount, converted to the token amount using its price.
  const cryptoStr = usdMode ? (asset?.priceUsd && Number(amountStr) > 0 ? (Number(amountStr) / asset.priceUsd).toFixed(Math.min(asset.decimals, 9)) : '') : amountStr;
  const amount = asset ? parseUnits(cryptoStr, asset.decimals) : null;
  const amountError =
    amountStr && amount == null
      ? usdMode
        ? 'Invalid amount'
        : `Invalid amount (max ${asset?.decimals} decimals)`
      : amount != null && asset && amount > asset.amount
        ? 'Exceeds your balance'
        : usdMode && !asset?.priceUsd
          ? `No price — switch to ${asset?.symbol}`
          : undefined;
  const fiatValue = amount != null && asset?.priceUsd ? toNumber(amount, asset.decimals) * asset.priceUsd : undefined;

  const fingerprint = `${network}|${account?.publicKey}|${addr?.valid ? addr.pubkey.toBase58() : ''}|${asset?.key}|${amount}`;
  const lastSameSend = recentSends.get(fingerprint);
  const isDuplicate = !!lastSameSend && Date.now() - lastSameSend < DUP_WINDOW_MS;

  const recentRecipients = useMemo(() => {
    const seen = new Set<string>();
    for (const page of history.data?.pages ?? []) for (const a of page.items) if (a.type === 'send' && a.counterparty) seen.add(a.counterparty);
    return [...seen].slice(0, 4);
  }, [history.data]);

  // Reset review when inputs change.
  useEffect(() => {
    setPrepared(null);
    setAck(false);
    setDupAck(false);
  }, [recipient, amountStr, assetKey, network]);

  const setMax = () => {
    if (!asset) return;
    const max = asset.isNative ? (asset.amount > SOL_RESERVE + 10_000n ? asset.amount - SOL_RESERVE - 10_000n : 0n) : asset.amount;
    setUsdMode(false); // Max is entered in the token's own units
    setAmountStr(formatUnits(max, asset.decimals));
  };
  const amountEquiv = usdMode ? (amount != null && asset ? `${formatAmount(toNumber(amount, asset.decimals))} ${asset.symbol}` : '') : fiatValue != null ? `≈ ${fmt(fiatValue, { ignoreHide: true })}` : '';

  const canReview = !!asset && addr?.valid && amount != null && amount > 0n && !amountError && !preparing;

  const review = async () => {
    if (!canReview || !account || !asset || !addr?.valid || amount == null) return;
    setPreparing(true);
    setPrepareError(undefined);
    try {
      const transferAsset: TransferAsset = asset.isNative
        ? { kind: 'sol' }
        : { kind: 'spl', mint: asset.mint, decimals: asset.decimals, programId: asset.holding!.programId, holding: asset.holding! };
      const prep = await prepareTransfer({ conn, owner: account.publicKey, recipient: addr.pubkey.toBase58(), asset: transferAsset, amount, ownerLamports: p.lamports ?? 0n, feeLevel });
      setPrepared(prep);
      setStep('review');
    } catch (e) {
      setPrepareError(friendlyError(e));
    } finally {
      setPreparing(false);
    }
  };

  const execute = async () => {
    if (!prepared || !account || inFlight.current) return;
    inFlight.current = true;
    setStep('status');
    setPhase('signing');
    setSignature(undefined);
    setSendError(undefined);
    let kp;
    try {
      kp = getKeypair(account.id);
      recentSends.set(fingerprint, Date.now());
      await signAndSend(conn, prepared, kp, (ph, sig) => {
        setPhase(ph);
        if (sig) setSignature(sig);
      });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      setPhase('failed');
      const sig = (e as { signature?: string }).signature;
      if (sig) setSignature(sig);
      setSendError(friendlyError(e));
    } finally {
      kp?.secretKey.fill(0);
      inFlight.current = false;
    }
  };

  const confirm = () => (requirePw ? setPwOpen(true) : execute());

  if (!account) return null;

  if (step === 'status')
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-6">
          <TxStatus
            phase={phase}
            signature={signature}
            error={sendError}
            network={network}
            title="Sent!"
            onDone={() => navigate('/')}
            onRetry={() => {
              setStep('form');
              setPrepared(null);
            }}
          />
        </Card>
      </div>
    );

  if (step === 'review' && prepared && asset && amount != null && addr?.valid) {
    const blocked = prepared.guard.blocked || prepared.errors.length > 0;
    const totalSol = (asset.isNative ? amount : 0n) + prepared.feeLamports + prepared.rentLamports;
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Review" subtitle="Check every detail. Transactions can’t be reversed." />
        <Card className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col items-center py-2 text-center">
            <TokenIcon symbol={asset.symbol} icon={asset.icon} mint={asset.mint} isNative={asset.isNative} size={56} />
            <p className="num mt-3 text-4xl font-bold" data-testid="review-amount">
              {formatAmount(toNumber(amount, asset.decimals))} {asset.symbol}
            </p>
            {fiatValue != null && <p className="text-sm text-mist-400">≈ {fmt(fiatValue, { ignoreHide: true })}</p>}
          </div>
          <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
            <Row label="From">
              {account.name} <span className="font-mono text-mist-400">({shortAddress(account.publicKey)})</span>
            </Row>
            <Row label="To">
              <span className="block break-all font-mono text-[13px] leading-relaxed" data-testid="review-recipient">
                {addr.pubkey.toBase58()}
              </span>
            </Row>
            <Row label="Network">
              <span className="inline-flex items-center gap-2">
                {config.label} {config.isTestnet ? <Badge tone="accent">Test</Badge> : <Badge tone="warn">Real funds</Badge>}
              </span>
            </Row>
            <Row label="Network fee">{feeLine(prepared)}</Row>
            {prepared.rentLamports > 0n && <Row label="Token account rent">{formatAmount(toNumber(prepared.rentLamports, 9), 9)} SOL</Row>}
            <Row label="Total SOL cost">
              <span className="num">{formatAmount(toNumber(totalSol, 9), 9)} SOL</span>
            </Row>
          </div>
          <TxSafetyPanel prepared={prepared} />
          {isDuplicate && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-warn/25 bg-warn/[0.07] p-3 text-sm text-warn">
              <input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-warn)]" />
              You sent this exact amount to this address {Math.round((Date.now() - lastSameSend!) / 1000)}s ago. Tick to confirm this is intentional.
            </label>
          )}
          {!blocked && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-mist-300">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-from)]" data-testid="ack" />
              I’ve verified the recipient address. I understand this transfer is final.
            </label>
          )}
          <div className="flex gap-2">
            <Button block size="lg" onClick={() => setStep('form')}>
              Back
            </Button>
            <Button block size="lg" variant="primary" disabled={blocked || !ack || (isDuplicate && !dupAck)} onClick={confirm} data-testid="confirm-send">
              <ShieldAlert className="h-4 w-4" /> Confirm & send
            </Button>
          </div>
        </Card>
        <PasswordPrompt
          open={pwOpen}
          onOpenChange={setPwOpen}
          title="Authorize transaction"
          description="Your settings require a password to sign."
          confirmLabel="Sign & send"
          onConfirm={() => {
            setPwOpen(false);
            execute();
          }}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------- form
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Send" subtitle={`On ${config.label}`} back="/" />
      {p.isLoading ? (
        <Card className="space-y-4 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : sendable.length === 0 ? (
        <Card>
          <EmptyState icon={<ArrowUpRight className="h-6 w-6" />} title="Nothing to send yet" body={config.isTestnet ? 'Use the faucet on the Home screen to get test SOL.' : 'Receive SOL or tokens first.'} action={<Button onClick={() => navigate('/receive')}>Receive</Button>} />
        </Card>
      ) : (
        <Card className="space-y-5 p-5 sm:p-6">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-mist-300">Asset</span>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-850/80 p-3 text-left hover:border-white/15" data-testid="asset-select">
              {asset && <TokenIcon symbol={asset.symbol} icon={asset.icon} mint={asset.mint} isNative={asset.isNative} size={36} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  {asset?.name} {asset && !asset.verified && <Badge tone="warn">Unverified</Badge>}
                </span>
                <span className="block text-xs text-mist-400">
                  Balance: {asset ? formatAmount(asset.uiAmount) : 0} {asset?.symbol}
                </span>
              </span>
              <TokenButton token={asset ? toPickable(asset) : undefined} onClick={() => setPickerOpen(true)} className="pointer-events-none h-9" />
            </button>
          </div>

          <div>
            <Input
              label="Recipient"
              placeholder="Solana address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              className="font-mono text-sm"
              error={recipient && addr && !addr.valid ? addr.reason : undefined}
              hint={addr?.valid ? (addr.pubkey.toBase58() === account.publicKey ? 'This is your own address' : addr.onCurve ? 'Valid Solana address' : 'Valid address (program-derived — no private key)') : undefined}
              data-testid="recipient"
              right={
                <span className="flex items-center">
                  <button type="button" className="rounded-lg p-2 text-mist-400 hover:text-mist-100" aria-label="Scan QR code" onClick={() => setScanOpen(true)}>
                    <QrCode className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-mist-400 hover:text-mist-100"
                    aria-label="Paste address"
                    onClick={async () => {
                      try {
                        setRecipient((await navigator.clipboard.readText()).trim());
                      } catch {
                        /* clipboard blocked */
                      }
                    }}
                  >
                    <ClipboardPaste className="h-4 w-4" />
                  </button>
                </span>
              }
            />
            {!recipient && recentRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recentRecipients.map((r) => (
                  <button key={r} type="button" onClick={() => setRecipient(r)} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-mist-300 hover:bg-white/[0.07]">
                    {shortAddress(r)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-mist-300">Amount</span>
              <button type="button" onClick={() => { setUsdMode((v) => !v); setAmountStr(''); }} disabled={!asset?.priceUsd} className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-accent hover:bg-white/[0.1] disabled:opacity-40">
                {usdMode ? `Switch to ${asset?.symbol}` : 'Switch to USD'}
              </button>
            </div>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))}
              className="num text-lg"
              error={amountError}
              hint={amountEquiv || (asset?.isNative && !usdMode ? 'Max keeps 0.001 SOL for rent & fees' : undefined)}
              data-testid="amount"
              right={
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-mist-400">{usdMode ? 'USD' : asset?.symbol}</span>
                  <button type="button" onClick={setMax} className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs font-bold text-accent hover:bg-white/[0.12]">
                    MAX
                  </button>
                </span>
              }
            />
          </div>

          {!config.isTestnet && <Notice tone="warn">You are on Mainnet. This sends real assets.</Notice>}
          {prepareError && <Notice tone="danger" title="Couldn't prepare transaction">{prepareError}</Notice>}

          <Button variant="primary" size="lg" block disabled={!canReview} loading={preparing} onClick={review} data-testid="review">
            {preparing ? 'Simulating…' : 'Review'}
          </Button>
        </Card>
      )}
      <TokenPicker open={pickerOpen} onOpenChange={setPickerOpen} tokens={sendable.map(toPickable)} onSelect={(t) => setAssetKey(t.mint)} title="Select asset to send" />
      <QrScanner open={scanOpen} onOpenChange={setScanOpen} onScan={(a) => setRecipient(a)} />
    </div>
  );
}
