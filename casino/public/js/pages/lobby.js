import { state, api, h, money } from '../core.js';
import { GAMES } from '../games/index.js';
import { betsTable } from './history.js';

export function renderLobby(view) {
  const recent = h('div', { class: 'card table-wrap' }, h('div', { class: 'spinner' }));
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
    h('div', { class: 'section-title' }, h('h2', {}, 'Your recent bets'), h('a', { href: '#/history' }, 'View all')),
    recent,
  );
  api('/bets?limit=10')
    .then(({ bets }) => recent.replaceChildren(betsTable(bets)))
    .catch((err) => recent.replaceChildren(h('p', { class: 'muted' }, err.message)));
}
