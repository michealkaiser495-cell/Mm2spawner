import { api, h, money, fmtMult, fmtTime } from '../core.js';

export function betsTable(bets) {
  if (!bets.length) return h('p', { class: 'muted' }, 'No bets yet. Go play something.');
  return h('table', {},
    h('thead', {}, h('tr', {}, ['Game', 'Time', 'Bet', 'Multiplier', 'Profit', 'Nonce'].map((t) => h('th', {}, t)))),
    h('tbody', {}, bets.map((b) => {
      const profit = b.payout - b.wager;
      return h('tr', {},
        h('td', { style: { textTransform: 'capitalize', fontWeight: 700 } }, b.game),
        h('td', { class: 'muted' }, fmtTime(b.createdAt)),
        h('td', { class: 'mono' }, money(b.wager)),
        h('td', { class: 'mono' }, fmtMult(b.multiplier)),
        h('td', { class: `mono ${profit >= 0 ? 'pos' : 'neg'}` }, `${profit >= 0 ? '+' : '−'}${money(Math.abs(profit))}`),
        h('td', { class: 'mono muted' }, b.nonce),
      );
    })),
  );
}

export function renderHistory(view) {
  const wrap = h('div', { class: 'card table-wrap' }, h('div', { class: 'spinner' }));
  const stats = h('div', { class: 'stat-row' });
  view.append(h('h1', {}, 'Bet history'), stats, wrap);
  api('/me').then(({ stats: s }) => {
    const net = s.paidOut - s.wagered;
    stats.append(
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Bets'), h('div', { class: 'v' }, s.bets)),
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Wagered'), h('div', { class: 'v' }, money(s.wagered))),
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Paid out'), h('div', { class: 'v' }, money(s.paidOut))),
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Net'), h('div', { class: `v ${net >= 0 ? 'pos' : 'neg'}` }, `${net >= 0 ? '+' : '−'}${money(Math.abs(net))}`)),
    );
  }).catch(() => {});
  api('/bets?limit=100')
    .then(({ bets }) => wrap.replaceChildren(betsTable(bets)))
    .catch((err) => wrap.replaceChildren(h('p', { class: 'muted' }, err.message)));
}
