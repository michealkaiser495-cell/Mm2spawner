import { api, h, money, betControl, gameShell, setBalance, toastError, celebrate, sfx } from '../core.js';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const OUTCOME = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };

function card(c) {
  if (!c) return h('div', { class: 'playing-card back' });
  const red = c.suit === 'H' || c.suit === 'D';
  return h('div', { class: `playing-card ${red ? 'red' : ''}` },
    h('div', { class: 'corner-t' }, c.rank, h('br'), SUIT[c.suit]),
    h('div', { class: 'suit-big' }, SUIT[c.suit]),
    h('div', { class: 'corner-b' }, c.rank, h('br'), SUIT[c.suit]),
  );
}

export function mountBlackjack(view) {
  const { root, panel, stage } = gameShell('Blackjack', 'Blackjack pays 3:2. Dealer stands on all 17s. Double and split allowed.');
  const bet = betControl(100);
  const deal = h('button', { class: 'btn btn-primary btn-block' }, 'Deal');
  const actionButtons = {
    hit: h('button', { class: 'btn' }, 'Hit'),
    stand: h('button', { class: 'btn' }, 'Stand'),
    double: h('button', { class: 'btn' }, 'Double'),
    split: h('button', { class: 'btn' }, 'Split'),
  };
  const actionsEl = h('div', { class: 'bj-actions' }, Object.values(actionButtons));
  const dealerCards = h('div', { class: 'cards' });
  const dealerLabel = h('div', { class: 'bj-label' }, 'Dealer');
  const hands = h('div', { class: 'bj-hands' });
  const banner = h('div', { class: 'result-banner' });
  const table = h('div', { class: 'bj-table' },
    h('div', { class: 'bj-row' }, dealerLabel, dealerCards),
    banner,
    h('div', { class: 'bj-row' }, hands),
  );

  panel.append(bet.el, deal, actionsEl, h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: 0 } }, 'Keys: H hit · S stand · D double · P split'));
  stage.append(table);
  view.append(root);

  let busy = false;
  let active = false;

  function label(text, total) {
    return [text, total !== undefined && total !== null ? h('span', { class: 'total' }, String(total)) : null];
  }

  function render(r) {
    active = r.active;
    dealerLabel.replaceChildren(...label('Dealer', r.dealer.total));
    dealerCards.replaceChildren(...r.dealer.cards.map(card));
    hands.replaceChildren(...r.hands.map((hand, i) => h('div', { class: `bj-hand ${r.active && i === r.activeHand ? 'current' : ''}` },
      h('div', { class: 'bj-label' }, ...label(r.hands.length > 1 ? `Hand ${i + 1} · ${money(hand.wager)}` : `You · ${money(hand.wager)}`, hand.total)),
      h('div', { class: 'cards' }, hand.cards.map(card)),
      hand.result ? h('div', { class: 'bj-outcome', style: { color: hand.payout > hand.wager ? 'var(--accent)' : hand.result === 'push' ? 'var(--warn)' : 'var(--danger)' } }, OUTCOME[hand.result]) : null,
    )));
    for (const [k, b] of Object.entries(actionButtons)) b.disabled = !r.actions.includes(k);
    deal.disabled = r.active;
    bet.disable(r.active);
    if (!r.active) {
      const net = r.payout - r.wager;
      banner.className = `result-banner ${net > 0 ? 'win' : net < 0 ? 'lose' : ''}`;
      banner.textContent = net > 0 ? `You win ${money(r.payout)}` : net < 0 ? `Dealer wins · −${money(-net)}` : 'Push · stake returned';
      if (r.dealer.blackjack) banner.textContent += ' (dealer blackjack)';
    } else {
      banner.textContent = '';
      banner.className = 'result-banner';
    }
    if (typeof r.balance === 'number') setBalance(r.balance);
  }

  function idle() {
    dealerLabel.replaceChildren('Dealer');
    dealerCards.replaceChildren(card(null), card(null));
    hands.replaceChildren(h('div', { class: 'bj-hand' }, h('div', { class: 'bj-label' }, 'You'), h('div', { class: 'cards' }, card(null), card(null))));
    Object.values(actionButtons).forEach((b) => { b.disabled = true; });
  }

  async function send(path, body) {
    if (busy) return;
    busy = true;
    try {
      const r = await api(path, { method: 'POST', body });
      sfx.card();
      render(r);
      if (!r.active) setTimeout(() => celebrate(r), 250);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  deal.addEventListener('click', () => {
    let wager;
    try {
      wager = bet.validate();
    } catch (err) {
      return toastError(err);
    }
    send('/games/blackjack/start', { wager });
  });
  for (const [k, b] of Object.entries(actionButtons)) b.addEventListener('click', () => send('/games/blackjack/action', { action: k }));

  const keys = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
  const onKey = (e) => {
    if (document.activeElement?.tagName === 'INPUT') return;
    const k = keys[e.key.toLowerCase()];
    if (k && active && !actionButtons[k].disabled) actionButtons[k].click();
    if (e.code === 'Space' && !active) {
      e.preventDefault();
      deal.click();
    }
  };
  window.addEventListener('keydown', onKey);

  idle();
  api('/games/blackjack/state').then((r) => { if (r.active) render(r); }).catch(() => {});
  return () => window.removeEventListener('keydown', onKey);
}
