export const state = { user: null, config: null, stats: null };

const listeners = new Set();
export const onBalance = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function setBalance(cents) {
  if (!state.user || typeof cents !== 'number') return;
  state.user.balance = cents;
  listeners.forEach((fn) => fn(cents));
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError('Network error. Check your connection.', 0);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    if (res.status === 401 && state.user) {
      state.user = null;
      location.hash = '#/login';
    }
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents) => usd.format((cents || 0) / 100);
export const toCents = (dollars) => Math.round(Number(dollars) * 100);
export const fmtMult = (m) => `${Number(m).toFixed(2)}x`;
export const fmtTime = (ms) => new Date(ms).toLocaleString();

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(message, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

export const toastError = (err) => toast(err?.message || String(err), 'err');

export function betControl(initialCents = 100) {
  const { minBet, maxBet } = state.config;
  const input = h('input', { type: 'number', min: (minBet / 100).toFixed(2), max: (maxBet / 100).toFixed(2), step: '0.01', value: (initialCents / 100).toFixed(2), inputmode: 'decimal' });
  const clamp = (c) => Math.min(maxBet, Math.max(minBet, c));
  const set = (c) => { input.value = (clamp(c) / 100).toFixed(2); input.dispatchEvent(new Event('input')); };
  const get = () => toCents(input.value);
  const quick = (label, fn) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => set(fn(get())) }, label);
  const el = h('div', { class: 'field' },
    h('label', {}, 'Bet amount (USD)'),
    input,
    h('div', { class: 'bet-quick' },
      quick('½', (c) => Math.floor(c / 2)),
      quick('2×', (c) => c * 2),
      quick('Min', () => minBet),
      quick('Max', () => Math.min(maxBet, state.user?.balance ?? maxBet)),
    ),
  );
  return {
    el,
    input,
    get,
    set,
    validate() {
      const c = get();
      if (!Number.isFinite(c) || c < minBet || c > maxBet) throw new Error(`Bet must be between ${money(minBet)} and ${money(maxBet)}`);
      if (state.user && c > state.user.balance) throw new Error('Insufficient balance. Deposit to keep playing.');
      return c;
    },
    disable(flag) { el.querySelectorAll('input, button').forEach((x) => { x.disabled = flag; }); },
  };
}

export function seg(options, value, onChange) {
  let current = value;
  const el = h('div', { class: 'seg' });
  const buttons = options.map(([val, label]) => {
    const b = h('button', { type: 'button', class: val === current ? 'active' : '' }, label);
    b.addEventListener('click', () => {
      if (b.disabled) return;
      current = val;
      buttons.forEach((x) => x.classList.toggle('active', x === b));
      onChange?.(val);
    });
    el.append(b);
    return b;
  });
  return { el, get: () => current, disable(flag) { buttons.forEach((b) => { b.disabled = flag; }); } };
}

export function stat(label, value = '') {
  const v = h('div', { class: 'v' }, value);
  return { el: h('div', { class: 'stat' }, h('div', { class: 'k' }, label), v), set: (x) => { v.textContent = x; } };
}

export function gameShell(title, subtitle) {
  const panel = h('div', { class: 'panel' });
  const stage = h('div', { class: 'stage' });
  const root = h('div', {},
    h('div', { class: 'game-head' }, h('div', {}, h('h1', {}, title), h('div', { class: 'muted' }, subtitle)), h('a', { href: '#/fair', class: 'btn btn-ghost btn-sm' }, 'Fairness')),
    h('div', { class: 'game-layout' }, panel, stage),
  );
  return { root, panel, stage };
}

export function setupCanvas(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
