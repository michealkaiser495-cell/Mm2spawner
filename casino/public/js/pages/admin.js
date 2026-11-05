import { api, h, money, fmtTime, toast, toastError } from '../core.js';

const METHOD_LABELS = { paypal: 'PayPal', cashapp: 'Cash App', crypto: 'Crypto', other: 'Other' };

export function renderAdmin(view) {
  const stats = h('div', { class: 'stat-row' });
  const list = h('div', { class: 'table-wrap' }, h('div', { class: 'spinner' }));
  let status = 'pending';
  const tabs = h('div', { class: 'seg', style: { maxWidth: '520px', marginBottom: '14px' } });
  const tabButtons = [['pending', 'Pending'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled'], ['', 'All']].map(([val, label]) => {
    const b = h('button', { type: 'button', class: val === status ? 'active' : '' }, label);
    b.addEventListener('click', () => {
      status = val;
      tabButtons.forEach((x) => x.classList.toggle('active', x === b));
      loadList();
    });
    tabs.append(b);
    return b;
  });

  view.append(
    h('h1', {}, 'Admin'),
    stats,
    h('section', { class: 'card' }, h('h2', {}, 'Withdrawal requests'),
      h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Pay the player outside the site, then mark the request Paid. Rejecting refunds the amount to their balance.'),
      tabs, list),
  );

  const statBox = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

  async function loadStats() {
    try {
      const o = await api('/admin/overview');
      stats.replaceChildren(
        statBox('Players', o.users),
        statBox('Deposits', `${money(o.deposits.total)} (${o.deposits.n})`),
        statBox('Paid out', `${money(o.withdrawalsPaid.total)} (${o.withdrawalsPaid.n})`),
        statBox('Pending', `${money(o.withdrawalsPending.total)} (${o.withdrawalsPending.n})`),
        statBox('House profit', money(o.bets.wagered - o.bets.paidOut)),
        statBox('Player balances', money(o.liabilities)),
      );
    } catch (err) {
      toastError(err);
    }
  }

  async function act(id, action) {
    const note = prompt(action === 'pay' ? 'Note for the player (optional), e.g. transaction ID:' : 'Reason for rejecting (shown to the player):', '');
    if (note === null) return;
    try {
      await api(`/admin/withdrawals/${id}/${action}`, { method: 'POST', body: { note } });
      toast(`#W${id} ${action === 'pay' ? 'marked paid' : 'rejected and refunded'}`, 'ok');
      loadList();
      loadStats();
    } catch (err) {
      toastError(err);
    }
  }

  async function loadList() {
    try {
      const { withdrawals } = await api(`/admin/withdrawals${status ? `?status=${status}` : ''}`);
      list.replaceChildren(withdrawals.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['ID', 'Requested', 'Player', 'Discord', 'Amount', 'Method', 'Details', 'Deposited / Wagered', 'Status', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, withdrawals.map((w) => h('tr', {},
            h('td', { class: 'mono' }, `#W${w.id}`),
            h('td', { class: 'muted' }, fmtTime(w.createdAt)),
            h('td', {}, w.username, h('div', { class: 'muted', style: { fontSize: '12px' } }, w.email)),
            h('td', { class: 'mono' }, w.discord),
            h('td', { class: 'mono' }, money(w.amount)),
            h('td', {}, METHOD_LABELS[w.method] || w.method),
            h('td', { class: 'mono', style: { whiteSpace: 'normal', maxWidth: '220px', wordBreak: 'break-all' } }, w.details),
            h('td', { class: 'mono' }, `${money(w.eligibility.deposited)} / ${money(w.eligibility.wagered)}`),
            h('td', {}, h('span', { class: `status ${w.status}` }, w.status)),
            h('td', {}, w.status === 'pending'
              ? h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => act(w.id, 'pay') }, 'Mark paid'),
                h('button', { class: 'btn btn-danger btn-sm', onclick: () => act(w.id, 'reject') }, 'Reject'))
              : w.adminNote ? h('span', { class: 'muted', style: { fontSize: '12px' } }, w.adminNote) : null),
          ))))
        : h('p', { class: 'muted' }, 'Nothing here.'));
    } catch (err) {
      toastError(err);
    }
  }

  loadStats();
  loadList();
}
