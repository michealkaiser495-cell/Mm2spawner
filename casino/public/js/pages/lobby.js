import { state, api, h, money, fmtMult, fmtTime } from '../core.js';
import { GAMES } from '../games/index.js';
import { betsTable } from './history.js';

export function renderLobby(view) {
  const recent = h('div', { class: 'card table-wrap' }, h('div', { class: 'spinner' }));
  const feed = h('div', { class: 'feed' });
  view.append(
    h('section', { class: 'hero' },
      h('div', {},
        h('h1', {}, `Welcome back, ${state.user.username}`),
        h('div', { class: 'muted' }, 'Pick a game. Every outcome is generated from your own seed pair and can be verified on the Fairness page.'),
      ),
      h('a', { class: 'btn btn-primary', href: '#/wallet' }, `Balance ${money(state.user.balance)} · Deposit`),
    ),
    h('div', { class: 'games-grid' }, GAMES.map((g) =>
      h('a', { class: `game-card gc-${g.id}`, href: `#/game/${g.id}` },
        h('span', { class: 'icon' }, g.icon),
        h('span', { class: 'title' }, g.name),
        h('span', { class: 'sub' }, g.tagline),
      ))),
    h('div', { class: 'lobby-split' },
      h('div', {},
        h('div', { class: 'section-title' }, h('h2', {}, 'Your recent bets'), h('a', { href: '#/history' }, 'View all')),
        recent),
      h('div', {},
        h('div', { class: 'section-title' }, h('h2', {}, h('span', { class: 'live-dot' }), 'Live wins')),
        h('div', { class: 'card' }, feed)),
    ),
  );

  async function loadFeed() {
    try {
      const { wins } = await api('/feed');
      feed.replaceChildren(...(wins.length ? wins.map((w) => h('div', { class: 'feed-row' },
        h('span', { class: 'feed-game' }, GAMES.find((g) => g.id === w.game)?.icon || '🎰'),
        h('span', { class: 'feed-player' }, w.player),
        h('span', { class: 'mono feed-mult' }, fmtMult(w.multiplier)),
        h('span', { class: 'mono pos' }, `+${money(w.payout - w.wager)}`),
        h('span', { class: 'muted feed-time', title: fmtTime(w.createdAt) }, ago(w.createdAt)),
      )) : [h('p', { class: 'muted', style: { margin: 0 } }, 'No big wins yet. Be the first.')]));
    } catch {
      /* feed is decorative */
    }
  }

  api('/bets?limit=10')
    .then(({ bets }) => recent.replaceChildren(betsTable(bets)))
    .catch((err) => recent.replaceChildren(h('p', { class: 'muted' }, err.message)));
  loadFeed();
  const timer = setInterval(loadFeed, 8000);
  return () => clearInterval(timer);
}

function ago(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
