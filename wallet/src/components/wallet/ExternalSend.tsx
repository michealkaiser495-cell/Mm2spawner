import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, QrCode, ShieldAlert, XCircle } from 'lucide-react';
import type { ExternalChain } from '@/lib/chains/external';
import { EVM_CHAINS } from '@/lib/crypto/evm';
import { UTXO_CHAINS } from '@/lib/crypto/utxo';
import { evmTokensFor, type EvmToken } from '@/lib/chains/evmTokens';
import { prepareEvmSend, sendEvm, waitForEvm, type EvmSendQuote } from '@/lib/chains/evmSend';
import { buildUtxoTx, deriveUtxoSigner, type UtxoSendPlan } from '@/lib/chains/utxoSend';
import { broadcastUtxoTx, fetchPrevTxHex, fetchUtxoFeeRate, fetchUtxos } from '@/lib/api/external';
import { formatAmount, formatUnits, parseUnits, shortAddress, toNumber } from '@/lib/format';
import { useExternalPrices } from '@/hooks/useExternalChain';
import { useActiveAccount, useWallet } from '@/state/wallet';
import { QrScanner } from './QrScanner';
import { Badge, Button, Card, cn, Input, Notice, Row } from '../ui/primitives';
import { TokenIcon } from '../ui/TokenIcon';

type Phase = 'form' | 'review' | 'sending' | 'done' | 'failed';

interface Prepared {
  amount: bigint; // in the SENT asset's base units
  decimals: number;
  symbol: string;
  feeStr: string; // formatted network fee, in the chain's native coin
  totalStr?: string; // only when fee and amount share a unit (native sends)
  evm?: EvmSendQuote;
  utxo?: UtxoSendPlan;
  token?: EvmToken;
  warnings: string[];
  errors: string[];
}

export function ExternalSend({ chain, address }: { chain: ExternalChain; address: string }) {
  const account = useActiveAccount()!;
  const getMnemonic = useWallet((s) => s.getMnemonicForAccount);
  const qc = useQueryClient();
  const prices = useExternalPrices();

  // On EVM chains you can also send ERC-20 tokens (USDT/USDC). `token` undefined = native coin.
  const tokens = chain.kind === 'evm' ? evmTokensFor(chain.id) : [];
  const [token, setToken] = useState<EvmToken | undefined>(undefined);
  const decimals = token?.decimals ?? chain.decimals;
  const symbol = token?.symbol ?? chain.symbol;
  const price = prices.data?.[token?.coingeckoId ?? chain.coingeckoId];

  const [recipient, setRecipient] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [usdMode, setUsdMode] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string>();
  const [txid, setTxid] = useState<string>();

  const addrOk = recipient ? chain.isValidAddress(recipient.trim()) : null;
  // In USD mode the field is a dollar amount; convert to the asset amount using its price.
  const cryptoStr = usdMode ? (price && Number(amountStr) > 0 ? (Number(amountStr) / price).toFixed(Math.min(decimals, 8)) : '') : amountStr;
  const amount = parseUnits(cryptoStr, decimals);
  const amountErr = amountStr && amount == null ? 'Invalid amount' : usdMode && !price ? 'Price unavailable — switch to ' + symbol : undefined;
  const canReview = addrOk && amount != null && amount > 0n && !preparing;
  const equiv = usdMode ? (amount != null ? `${formatAmount(toNumber(amount, decimals))} ${symbol}` : '') : price && Number(amountStr) > 0 ? `≈ $${(Number(amountStr) * price).toFixed(2)}` : '';

  const reset = () => {
    setPhase('form');
    setPrepared(null);
    setAck(false);
    setError(undefined);
  };

  const review = async () => {
    if (!canReview || amount == null) return;
    setPreparing(true);
    setError(undefined);
    const mk = getMnemonic(account.id);
    if (!mk) {
      setError('This account has no recovery phrase, so it cannot sign transactions.');
      setPreparing(false);
      return;
    }
    try {
      const to = recipient.trim();
      if (chain.kind === 'evm') {
        const quote = await prepareEvmSend({ chain: EVM_CHAINS[chain.id], mnemonic: mk.mnemonic, index: mk.index, to, amountWei: amount, token });
        setPrepared({
          amount,
          decimals,
          symbol,
          token,
          feeStr: `${formatUnits(quote.feeWei, 18)} ${chain.symbol}`,
          totalStr: token ? undefined : `${formatUnits(quote.totalWei, 18)} ${chain.symbol}`,
          evm: quote,
          warnings: quote.warnings,
          errors: quote.errors,
        });
      } else {
        const coin = UTXO_CHAINS[chain.id];
        const signer = deriveUtxoSigner(mk.mnemonic, coin, mk.index);
        const [utxos, feeRate] = await Promise.all([fetchUtxos(coin, signer.address), fetchUtxoFeeRate(coin)]);
        const errors: string[] = [];
        if (!utxos.length) errors.push(`No spendable ${chain.symbol} found at your address.`);
        let prevTxHex: Record<string, string> | undefined;
        if (signer.type === 'legacy') {
          prevTxHex = {};
          for (const u of utxos) prevTxHex[u.txid] = await fetchPrevTxHex(coin, u.txid);
        }
        let plan: UtxoSendPlan | undefined;
        try {
          if (utxos.length) plan = buildUtxoTx({ signer, utxos, to, amount, feePerByte: feeRate, prevTxHex });
        } catch (e) {
          errors.push((e as Error).message);
        }
        const fee = plan?.fee ?? 0n;
        setPrepared({
          amount,
          decimals,
          symbol,
          feeStr: `${formatUnits(fee, chain.decimals)} ${chain.symbol}`,
          totalStr: `${formatUnits(amount + fee, chain.decimals)} ${chain.symbol}`,
          utxo: plan,
          warnings: to === signer.address ? ['You are sending to your own address.'] : [],
          errors,
        });
      }
      setPhase('review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const execute = async () => {
    if (!prepared || amount == null) return;
    setPhase('sending');
    setError(undefined);
    const mk = getMnemonic(account.id);
    if (!mk) {
      setError('Wallet is locked.');
      setPhase('failed');
      return;
    }
    try {
      let hash: string;
      if (chain.kind === 'evm' && prepared.evm) {
        hash = await sendEvm({ chain: EVM_CHAINS[chain.id], mnemonic: mk.mnemonic, index: mk.index, to: recipient.trim(), amountWei: amount, quote: prepared.evm, token: prepared.token });
        setTxid(hash);
        await waitForEvm(EVM_CHAINS[chain.id], hash).catch(() => undefined);
      } else if (prepared.utxo) {
        hash = await broadcastUtxoTx(UTXO_CHAINS[chain.id], prepared.utxo.hex);
        setTxid(hash);
      } else {
        throw new Error('Nothing to send');
      }
      setPhase('done');
      qc.invalidateQueries({ queryKey: ['external-account', chain.id] });
    } catch (e) {
      setError((e as Error).message);
      setPhase('failed');
    }
  };

  if (phase === 'sending' || phase === 'done' || phase === 'failed') {
    const ok = phase === 'done';
    return (
      <div className="py-4 text-center" role="status" aria-live="polite">
        <div className={cn('mx-auto grid h-20 w-20 place-items-center rounded-full', phase === 'sending' && 'animate-pulse-ring bg-white/[0.06]', ok && 'bg-up/15 text-up', phase === 'failed' && 'bg-down/15 text-down')}>
          {phase === 'sending' ? <Loader2 className="h-9 w-9 animate-spin text-accent" /> : ok ? <CheckCircle2 className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold">{phase === 'sending' ? 'Broadcasting…' : ok ? 'Sent!' : 'Failed'}</h2>
        {error && <p className="mx-auto mt-2 max-w-sm break-words text-sm text-down">{error}</p>}
        {txid && (
          <a href={chain.explorerTx(txid)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            View on explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {phase !== 'sending' && (
          <Button variant="primary" block className="mx-auto mt-6 max-w-xs" onClick={reset}>
            Done
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'review' && prepared && amount != null) {
    const blocked = prepared.errors.length > 0;
    return (
      <Card className="space-y-4 p-5">
        <div className="flex flex-col items-center py-2 text-center">
          <TokenIcon symbol={prepared.symbol} mint={prepared.token ? prepared.token.address : chain.id} size={52} />
          <p className="num mt-3 text-3xl font-bold">{formatAmount(toNumber(prepared.amount, prepared.decimals))} {prepared.symbol}</p>
        </div>
        <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
          <Row label="To"><span className="break-all font-mono text-[13px]">{recipient.trim()}</span></Row>
          <Row label="Network">{chain.name} {chain.kind === 'evm' && <Badge tone="warn">Real funds</Badge>}</Row>
          <Row label="Network fee">{prepared.feeStr}{prepared.token ? ` (paid in ${chain.symbol})` : ''}</Row>
          {prepared.totalStr && <Row label="Total">{prepared.totalStr}</Row>}
        </div>
        {prepared.errors.map((e, i) => <Notice key={i} tone="danger" title="Can't send">{e}</Notice>)}
        {prepared.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
        <Notice tone="warn">Double-check the address — {chain.name} transfers are irreversible. Try a small amount first.</Notice>
        {!blocked && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-mist-300">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-from)]" />
            I’ve verified the recipient. I understand this is final.
          </label>
        )}
        <div className="flex gap-2">
          <Button block onClick={reset}>Back</Button>
          <Button block variant="primary" disabled={blocked || !ack} onClick={execute}>
            <ShieldAlert className="h-4 w-4" /> Confirm & send
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tokens.length > 0 && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-mist-300">Asset</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setToken(undefined); setAmountStr(''); }} className={cn('flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold', !token ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.05]')}>
              <TokenIcon symbol={chain.symbol} mint={chain.id} size={18} /> {chain.symbol}
            </button>
            {tokens.map((t) => (
              <button key={t.address} type="button" onClick={() => { setToken(t); setAmountStr(''); }} className={cn('flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold', token?.address === t.address ? 'accent-ring border-transparent bg-white/[0.08]' : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.05]')}>
                <TokenIcon symbol={t.symbol} mint={t.address} size={18} /> {t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}
      <Input
        label={`Recipient ${chain.name} address`}
        value={recipient}
        onChange={(e) => setRecipient(e.target.value.trim())}
        placeholder={chain.kind === 'evm' ? '0x…' : `${chain.symbol} address`}
        className="font-mono text-sm"
        error={recipient && addrOk === false ? `Not a valid ${chain.name} address` : undefined}
        data-testid="ext-recipient"
        right={
          <button type="button" onClick={() => setScanOpen(true)} className="rounded-lg p-2 text-mist-400 hover:text-mist-100" aria-label="Scan QR code">
            <QrCode className="h-4 w-4" />
          </button>
        }
      />
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-mist-300">Amount</span>
          <button type="button" onClick={() => { setUsdMode((v) => !v); setAmountStr(''); }} disabled={!price} className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-accent hover:bg-white/[0.1] disabled:opacity-40">
            {usdMode ? `Switch to ${symbol}` : 'Switch to USD'}
          </button>
        </div>
        <Input
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="0.00"
          className="num text-lg"
          error={amountErr}
          hint={equiv}
          right={<span className="pr-1 text-sm font-semibold text-mist-400">{usdMode ? 'USD' : symbol}</span>}
          data-testid="ext-amount"
        />
      </div>
      {error && <Notice tone="danger" title="Error">{error}</Notice>}
      <Notice>
        {token ? `${token.symbol} is sent on ${chain.name}; the small network fee is paid in ${chain.symbol}. ` : `Fees use the cheapest reliable rate for ${chain.name}. `}
        Sends from {shortAddress(address, 6)}.
      </Notice>
      <Button variant="primary" size="lg" block disabled={!canReview} loading={preparing} onClick={review} data-testid="ext-review">
        {preparing ? 'Preparing…' : `Review ${symbol} send`}
      </Button>
      <QrScanner open={scanOpen} onOpenChange={setScanOpen} onScan={(addr) => setRecipient(addr)} />
    </div>
  );
}
