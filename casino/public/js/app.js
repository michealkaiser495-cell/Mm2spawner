import { state, api, h, money, onBalance, toastError, sfx } from './core.js';
import { renderAdmin } from './pages/admin.js';
import { renderAuth } from './pages/auth.js';
import { renderLobby } from './pages/lobby.js';
import { renderWallet } from './pages/wallet.js';
import { renderFair } from './pages/fair.js';
import { renderHistory } from './pages/history.js';
import { GAMES } from './games/index.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const account = document.getElementById('account');
let cleanup = null;

function renderChrome() {
  nav.replaceChildren();
  account.replaceChildren();
  if (!state.user) {
    account.append(h('a', { class: 'btn btn-ghost btn-sm', href: '#/login' }, 'Log in'), h('a', { class: 'btn btn-primary btn-sm', href: '#/signup' }, 'Sign up'));
    return;
  }
  const links = [['#/', 'Lobby'], ...GAMES.map((g) => [`#/game/${g.id}`, g.name]), ['#/history', 'History'], ['#/wallet', 'Wallet']];
  if (state.user.isAdmin) links.push(['#/admin', 'Admin']);
  for (const [href, label] of links) nav.append(h('a', { href, 'data-href': href }, label));
  const amount = h('span', { id: 'balance' }, money(state.user.balance));
  shown = state.user.balance;
  const mute = h('button', { class: 'btn btn-ghost btn-sm', title: 'Toggle sound', 'aria-label': 'Toggle sound' }, sfx.isMuted() ? '🔇' : '🔊');
  mute.addEventListener('click', () => {
    sfx.setMuted(!sfx.isMuted());
    mute.textContent = sfx.isMuted() ? '🔇' : '🔊';
  });
  account.append(
    mute,
    h('div', { class: 'balance-pill' }, amount, h('a', { class: 'btn btn-primary', href: '#/wallet' }, 'Deposit')),
    h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch (err) {
          toastError(err);
        }
        state.user = null;
        location.hash = '#/login';
        route();
      },
    }, 'Log out'),
  );
  highlightNav();
}

function highlightNav() {
  const current = location.hash.split('?')[0] || '#/';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.href === current));
}

let shown = null;
let tween = 0;
onBalance((cents) => {
  const el = document.getElementById('balance');
  if (!el) return;
  cancelAnimationFrame(tween);
  const from = shown ?? cents;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 450);
    shown = Math.round(from + (cents - from) * (1 - (1 - p) ** 3));
    el.textContent = money(shown);
    if (p < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
  if (cents > from) {
    el.classList.remove('balance-flash');
    void el.offsetWidth;
    el.classList.add('balance-flash');
  }
});

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch (err) {
      console.error(err);
    }
    cleanup = null;
  }
  const { parts, params } = parseHash();
  const [section, sub] = parts;
  window.scrollTo(0, 0);

  if (!state.user && section !== 'login' && section !== 'signup') {
    location.hash = '#/login';
    return;
  }
  if (state.user && (section === 'login' || section === 'signup')) {
    location.hash = '#/';
    return;
  }
  renderChrome();
  view.replaceChildren();

  const mount = (result) => {
    if (typeof result === 'function') cleanup = result;
  };

  if (section === 'login' || section === 'signup') {
    mount(renderAuth(view, section, () => {
      location.hash = '#/';
    }));
  } else if (!section) {
    mount(renderLobby(view));
  } else if (section === 'wallet') {
    mount(renderWallet(view, params));
  } else if (section === 'fair') {
    mount(renderFair(view));
  } else if (section === 'admin' && state.user.isAdmin) {
    mount(renderAdmin(view));
  } else if (section === 'history') {
    mount(renderHistory(view));
  } else if (section === 'game' && GAMES.some((g) => g.id === sub)) {
    mount(GAMES.find((g) => g.id === sub).mount(view));
  } else {
    view.append(h('div', { class: 'card' }, h('h2', {}, 'Page not found'), h('a', { href: '#/' }, 'Back to the lobby')));
  }
}

async function boot() {
  view.append(h('div', { class: 'spinner' }));
  try {
    state.config = await api('/config');
  } catch (err) {
    view.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Cannot reach the server'), h('p', { class: 'muted' }, err.message)));
    return;
  }
  try {
    const me = await api('/me');
    state.user = me.user;
    state.stats = me.stats;
  } catch {
    state.user = null;
  }
  window.addEventListener('hashchange', route);
  route();
}

boot();
