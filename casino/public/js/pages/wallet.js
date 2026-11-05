import { state, api, h, money, toCents, fmtTime, setBalance, toast } from '../core.js';

const TX_LABELS = { deposit: 'Deposit', bet: 'Bet', win: 'Win', bonus: 'Bonus' };

export function renderWallet(view, params) {
  const cfg = state.config;
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

  const form = h('form', {},
    h('div', { class: 'preset-row' }, presetButtons),
    h('div', { class: 'field' }, h('label', {}, 'Amount (USD)'), amount),
    err, go,
    h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: 0 } },
      `Min ${money(cfg.minDeposit)} · Max ${money(cfg.maxDeposit)} per deposit · ${money(cfg.dailyDepositLimit)} per 24 hours. Payments are processed by Stripe; card details never touch our servers.`),
  );
  form.addEventListener('submit', async (e) => {
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

  const deposits = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  const txs = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  const balanceEl = h('div', { class: 'mono', style: { fontSize: '38px', fontWeight: 800 } }, money(state.user.balance));

  view.append(...[
    h('h1', {}, 'Wallet'),
    flag && notices[flag] ? h('div', { class: `notice ${notices[flag][0]}` }, notices[flag][1]) : null,
    cfg.depositsEnabled ? null : h('div', { class: 'notice warn' }, 'Deposits are disabled: the server has no STRIPE_SECRET_KEY configured.'),
    h('div', { class: 'two-col' },
      h('section', { class: 'card' }, h('h2', {}, 'Deposit'), form),
      h('section', { class: 'card' },
        h('h2', {}, 'Balance'), balanceEl,
        h('p', { class: 'muted' }, 'Play credit is for entertainment on this site only.'),
        h('h3', { style: { marginTop: '20px' } }, 'Recent deposits'), deposits,
      ),
    ),
    h('section', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Transactions'), txs),
  ].filter(Boolean));

  async function load() {
    try {
      const [me, d, t] = await Promise.all([api('/me'), api('/wallet/deposits'), api('/transactions')]);
      setBalance(me.user.balance);
      balanceEl.textContent = money(me.user.balance);
      deposits.replaceChildren(d.deposits.length
        ? h('table', {}, h('thead', {}, h('tr', {}, ['Date', 'Amount', 'Status'].map((x) => h('th', {}, x)))),
          h('tbody', {}, d.deposits.map((r) => h('tr', {}, h('td', { class: 'muted' }, fmtTime(r.createdAt)), h('td', { class: 'mono' }, money(r.amount)), h('td', {}, h('span', { class: `status ${r.status}` }, r.status))))))
        : h('p', { class: 'muted' }, 'No deposits yet.'));
      txs.replaceChildren(t.transactions.length
        ? h('table', {}, h('thead', {}, h('tr', {}, ['Date', 'Type', 'Game', 'Amount', 'Balance'].map((x) => h('th', {}, x)))),
          h('tbody', {}, t.transactions.map((r) => h('tr', {},
            h('td', { class: 'muted' }, fmtTime(r.createdAt)),
            h('td', {}, TX_LABELS[r.type] || r.type),
            h('td', { style: { textTransform: 'capitalize' } }, r.game || '—'),
            h('td', { class: `mono ${r.amount >= 0 ? 'pos' : 'neg'}` }, `${r.amount >= 0 ? '+' : '−'}${money(Math.abs(r.amount))}`),
            h('td', { class: 'mono' }, money(r.balanceAfter)),
          ))))
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
