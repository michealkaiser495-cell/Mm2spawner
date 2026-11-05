import { state, api, h, money, toCents, fmtTime, setBalance, toast, toastError } from '../core.js';

const TX_LABELS = { deposit: 'Deposit', bet: 'Bet', win: 'Win', bonus: 'Bonus', withdrawal: 'Withdrawal', withdrawal_refund: 'Withdrawal refund' };
const METHOD_LABELS = { paypal: 'PayPal', cashapp: 'Cash App', crypto: 'Crypto', other: 'Other' };

function table(headers, rows) {
  return h('table', {}, h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))), h('tbody', {}, rows));
}

export function renderWallet(view, params) {
  const cfg = state.config;
  const contact = cfg.discordContact;
  const notices = {
    success: ['ok', 'Payment received. Your balance has been topped up.'],
    pending: ['warn', 'Payment is processing. Your balance updates as soon as Stripe confirms it.'],
    cancelled: ['warn', 'Checkout cancelled. No charge was made.'],
    error: ['err', 'We could not confirm that payment yet. If you were charged it will be credited automatically.'],
  };
  const flag = params.get('deposit');

  const amount = h('input', { type: 'number', min: cfg.minDeposit / 100, max: cfg.maxDeposit / 100, step: '1', value: '25', inputmode: 'decimal' });
  const presets = [10, 25, 50, 100].filter((d) => d * 100 >= cfg.minDeposit && d * 100 <= cfg.maxDeposit);
  const presetButtons = presets.map((d) => h('button', { type: 'button', class: `btn ${d === 25 ? 'active' : ''}`, onclick: () => { amount.value = d; sync(); } }, `$${d}`));
  const sync = () => presetButtons.forEach((b, i) => b.classList.toggle('active', Number(amount.value) === presets[i]));
  amount.addEventListener('input', sync);
  const err = h('div', { class: 'form-error' });
  const go = h('button', { class: 'btn btn-primary btn-block', type: 'submit', disabled: !cfg.depositsEnabled }, 'Continue to secure checkout');

  const depositForm = h('form', {},
    h('div', { class: 'preset-row' }, presetButtons),
    h('div', { class: 'field' }, h('label', {}, 'Amount (USD)'), amount),
    err, go,
    h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: 0 } },
      `Min ${money(cfg.minDeposit)} · Max ${money(cfg.maxDeposit)} per deposit · ${money(cfg.dailyDepositLimit)} per 24 hours. Payments are processed by Stripe; card details never touch our servers.`),
  );
  depositForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const cents = toCents(amount.value);
    if (!Number.isFinite(cents) || cents < cfg.minDeposit || cents > cfg.maxDeposit) {
      err.textContent = `Enter an amount between ${money(cfg.minDeposit)} and ${money(cfg.maxDeposit)}.`;
      return;
    }
    go.disabled = true;
    go.textContent = 'Redirecting to Stripe…';
    try {
      const { url } = await api('/wallet/deposit', { method: 'POST', body: { amount: cents } });
      location.href = url;
    } catch (ex) {
      err.textContent = ex.message;
      go.disabled = false;
      go.textContent = 'Continue to secure checkout';
    }
  });

  const wAmount = h('input', { type: 'number', min: cfg.minWithdraw / 100, step: '0.01', inputmode: 'decimal', placeholder: `Min ${money(cfg.minWithdraw)}` });
  const wMethod = h('select', {}, cfg.withdrawMethods.map((m) => h('option', { value: m }, METHOD_LABELS[m] || m)));
  const wDetails = h('input', { type: 'text', maxlength: 200, placeholder: 'PayPal email, $cashtag, wallet address…' });
  const wDiscord = h('input', { type: 'text', maxlength: 33, placeholder: 'your_discord_name', autocomplete: 'off' });
  const wErr = h('div', { class: 'form-error' });
  const wGo = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Request withdrawal');
  const eligibilityEl = h('div');
  const withdrawForm = h('form', {},
    h('div', { class: 'notice warn', style: { marginBottom: '14px' } },
      'Withdrawals are paid out manually. After you submit, DM ', h('strong', {}, contact), ' on Discord with your request ID to get paid.'),
    eligibilityEl,
    h('div', { class: 'two-col', style: { gap: '12px' } },
      h('div', { class: 'field' }, h('label', {}, 'Amount (USD)'), h('div', { class: 'input-group' }, wAmount, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { wAmount.value = (state.user.balance / 100).toFixed(2); } }, 'Max'))),
      h('div', { class: 'field' }, h('label', {}, 'Payout method'), wMethod),
    ),
    h('div', { class: 'field' }, h('label', {}, 'Payout details'), wDetails),
    h('div', { class: 'field' }, h('label', {}, 'Your Discord username'), wDiscord),
    wErr, wGo,
  );
  withdrawForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    wErr.textContent = '';
    const cents = toCents(wAmount.value);
    if (!Number.isFinite(cents) || cents < cfg.minWithdraw) return (wErr.textContent = `Minimum withdrawal is ${money(cfg.minWithdraw)}.`);
    if (cents > state.user.balance) return (wErr.textContent = 'You cannot withdraw more than your balance.');
    wGo.disabled = true;
    try {
      const r = await api('/wallet/withdraw', {
        method: 'POST',
        body: { amount: cents, method: wMethod.value, details: wDetails.value, discord: wDiscord.value },
      });
      setBalance(r.balance);
      toast(`Request #W${r.withdrawal.id} submitted. DM ${r.contact} on Discord to get paid.`, 'ok');
      wAmount.value = '';
      load();
    } catch (ex) {
      wErr.textContent = ex.message;
    } finally {
      wGo.disabled = false;
    }
  });

  const deposits = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  const withdrawals = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  const txs = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  const balanceEl = h('div', { class: 'mono', style: { fontSize: '38px', fontWeight: 800 } }, money(state.user.balance));

  view.append(...[
    h('h1', {}, 'Wallet'),
    flag && notices[flag] ? h('div', { class: `notice ${notices[flag][0]}` }, notices[flag][1]) : null,
    cfg.depositsEnabled ? null : h('div', { class: 'notice warn' }, 'Deposits are disabled: the server has no STRIPE_SECRET_KEY configured.'),
    h('div', { class: 'two-col' },
      h('section', { class: 'card' }, h('h2', {}, 'Deposit'), depositForm),
      h('section', { class: 'card' },
        h('h2', {}, 'Balance'), balanceEl,
        h('h3', { style: { marginTop: '20px' } }, 'Recent deposits'), deposits,
      ),
    ),
    h('div', { class: 'two-col', style: { marginTop: '18px' } },
      h('section', { class: 'card' }, h('h2', {}, 'Withdraw'), withdrawForm),
      h('section', { class: 'card' }, h('h2', {}, 'Your withdrawals'), withdrawals),
    ),
    h('section', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Transactions'), txs),
  ].filter(Boolean));

  function renderEligibility(e) {
    if (!e.hasDeposit) {
      eligibilityEl.replaceChildren(h('p', { class: 'muted', style: { fontSize: '13px' } }, 'You need at least one deposit before you can withdraw. Bonus credit is play-only.'));
    } else if (e.wagerRequired > 0) {
      const pct = Math.min(100, Math.round((e.wagered / e.deposited) * 100));
      eligibilityEl.replaceChildren(h('div', { class: 'field' },
        h('label', {}, `Wagering: ${money(e.wagered)} of ${money(e.deposited)} (${money(e.wagerRequired)} to go)`),
        h('div', { class: 'progress' }, h('div', { style: { width: `${pct}%` } }))));
    } else {
      eligibilityEl.replaceChildren();
    }
    const blocked = !e.hasDeposit || e.wagerRequired > 0 || e.pending;
    wGo.disabled = blocked;
    wGo.textContent = e.pending ? 'You have a pending request' : 'Request withdrawal';
  }

  async function load() {
    try {
      const [me, d, w, t] = await Promise.all([api('/me'), api('/wallet/deposits'), api('/wallet/withdrawals'), api('/transactions')]);
      setBalance(me.user.balance);
      balanceEl.textContent = money(me.user.balance);
      renderEligibility(w.eligibility);
      deposits.replaceChildren(d.deposits.length
        ? table(['Date', 'Amount', 'Status'], d.deposits.map((r) => h('tr', {}, h('td', { class: 'muted' }, fmtTime(r.createdAt)), h('td', { class: 'mono' }, money(r.amount)), h('td', {}, h('span', { class: `status ${r.status}` }, r.status)))))
        : h('p', { class: 'muted' }, 'No deposits yet.'));
      withdrawals.replaceChildren(w.withdrawals.length
        ? table(['ID', 'Date', 'Amount', 'Method', 'Status', ''], w.withdrawals.map((r) => h('tr', {},
          h('td', { class: 'mono' }, `#W${r.id}`),
          h('td', { class: 'muted' }, fmtTime(r.createdAt)),
          h('td', { class: 'mono' }, money(r.amount)),
          h('td', {}, METHOD_LABELS[r.method] || r.method),
          h('td', {}, h('span', { class: `status ${r.status}` }, r.status), r.adminNote ? h('div', { class: 'muted', style: { fontSize: '12px', whiteSpace: 'normal' } }, r.adminNote) : null),
          h('td', {}, r.status === 'pending' ? h('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: async () => {
              try {
                const res = await api(`/wallet/withdrawals/${r.id}/cancel`, { method: 'POST' });
                setBalance(res.balance);
                toast('Withdrawal cancelled and refunded', 'ok');
                load();
              } catch (ex) {
                toastError(ex);
              }
            },
          }, 'Cancel') : null),
        )))
        : h('p', { class: 'muted' }, `No withdrawals yet. Questions? DM ${contact} on Discord.`));
      txs.replaceChildren(t.transactions.length
        ? table(['Date', 'Type', 'Game', 'Amount', 'Balance'], t.transactions.map((r) => h('tr', {},
          h('td', { class: 'muted' }, fmtTime(r.createdAt)),
          h('td', {}, TX_LABELS[r.type] || r.type),
          h('td', { style: { textTransform: 'capitalize' } }, r.game || '—'),
          h('td', { class: `mono ${r.amount >= 0 ? 'pos' : 'neg'}` }, `${r.amount >= 0 ? '+' : '−'}${money(Math.abs(r.amount))}`),
          h('td', { class: 'mono' }, money(r.balanceAfter)),
        )))
        : h('p', { class: 'muted' }, 'No transactions yet.'));
      return d.deposits;
    } catch (ex) {
      toast(ex.message, 'err');
      return [];
    }
  }

  let timer = null;
  let tries = 0;
  load().then((list) => {
    if (flag === 'success' || flag === 'pending') {
      const poll = async () => {
        const latest = await load();
        if (latest.some((x) => x.status === 'pending') && ++tries < 10) timer = setTimeout(poll, 3000);
      };
      if (list.some((x) => x.status === 'pending')) timer = setTimeout(poll, 3000);
    }
  });
  return () => clearTimeout(timer);
}
