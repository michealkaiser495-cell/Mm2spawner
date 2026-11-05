import { state, api, h, money, gameShell, setBalance, setupCanvas, toastError, celebrate, sfx } from '../core.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const FILL = { green: '#12a150', red: '#e5384f', black: '#23273a' };
const CHIPS = [10, 100, 500, 2500, 10000];
const chipLabel = (c) => (c >= 100 ? `$${c / 100}` : `${c}¢`);

export function mountRoulette(view) {
  const { root, panel, stage } = gameShell('Roulette', 'European single-zero wheel. Click the board to place chips.');
  let chip = 100;
  const bets = new Map();
  const history = [];
  const chipButtons = CHIPS.map((c) => {
    const b = h('button', { type: 'button', class: c === chip ? 'active' : '' }, chipLabel(c));
    b.addEventListener('click', () => { chip = c; chipButtons.forEach((x) => x.classList.toggle('active', x === b)); });
    return b;
  });
  const totalEl = h('div', { class: 'mono', style: { fontSize: '22px', fontWeight: 800 } }, money(0));
  const spin = h('button', { class: 'btn btn-primary btn-block' }, 'Spin');
  const undo = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Undo');
  const clear = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Clear');
  const doubleAll = h('button', { class: 'btn btn-ghost', type: 'button' }, '2×');

  const canvas = h('canvas', { class: 'roulette-canvas' });
  const numEl = h('div', { class: 'num', style: { background: 'var(--panel-2)' } }, '–');
  const banner = h('div', { class: 'result-banner' });
  const board = h('div', { class: 'roulette-board' });
  const cells = new Map();

  panel.append(
    h('div', { class: 'field' }, h('label', {}, 'Chip value'), h('div', { class: 'chip-picker' }, chipButtons)),
    h('div', { class: 'field' }, h('label', {}, 'Total bet'), totalEl),
    h('div', { class: 'bet-quick', style: { marginBottom: '12px' } }, undo, doubleAll, clear),
    spin,
    h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: 0 } }, 'Straight up pays 35:1 · Dozens & columns 2:1 · Red/Black, Odd/Even, 1-18/19-36 pay 1:1.'),
  );
  stage.append(
    h('div', { class: 'roulette-top' },
      h('div', { style: { maxWidth: '300px', width: '100%', margin: '0 auto' } }, canvas),
      h('div', { class: 'roulette-result' }, numEl, banner),
    ),
    h('div', { class: 'table-wrap' }, h('div', { style: { minWidth: '620px' } }, board)),
  );
  view.append(root);

  const keyOf = (type, value) => `${type}:${value ?? ''}`;

  function cell(type, value, text, cls, gridColumn, gridRow) {
    const el = h('div', { class: `rb-cell ${cls}`, style: { gridColumn, gridRow }, role: 'button', tabindex: 0, title: text }, text);
    const key = keyOf(type, value);
    const place = () => {
      if (spinning) return;
      const prev = bets.get(key);
      const next = (prev?.amount || 0) + chip;
      bets.set(key, { type, value, amount: next });
      sfx.click();
      history.push({ key, amount: chip });
      renderChips();
    };
    el.addEventListener('click', place);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(); } });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (spinning || !bets.has(key)) return;
      bets.delete(key);
      renderChips();
    });
    cells.set(key, el);
    board.append(el);
  }

  cell('straight', 0, '0', 'green', '1', '1 / span 3');
  for (let n = 1; n <= 36; n++) {
    const col = Math.ceil(n / 3) + 1;
    const row = 3 - ((n - 1) % 3);
    cell('straight', n, String(n), colorOf(n), String(col), String(row));
  }
  for (let c = 1; c <= 3; c++) cell('column', c, '2:1', 'out', '14', String(4 - c));
  ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => cell('dozen', i + 1, t, 'out', `${2 + i * 4} / span 4`, '4'));
  [['low', '1-18'], ['even', 'Even'], ['red', 'Red'], ['black', 'Black'], ['odd', 'Odd'], ['high', '19-36']].forEach(([type, t], i) => {
    const cls = type === 'red' ? 'red' : type === 'black' ? 'black' : 'out';
    cell(type, null, t, cls, `${2 + i * 2} / span 2`, '5');
  });

  function total() {
    let s = 0;
    for (const b of bets.values()) s += b.amount;
    return s;
  }

  function renderChips() {
    for (const [key, el] of cells) {
      el.querySelector('.rb-chip')?.remove();
      const b = bets.get(key);
      if (b) el.append(h('span', { class: 'rb-chip' }, b.amount >= 100 ? `${Math.round(b.amount / 100)}` : `.${String(b.amount).padStart(2, '0')}`));
    }
    totalEl.textContent = money(total());
  }

  undo.addEventListener('click', () => {
    if (spinning) return;
    const last = history.pop();
    if (!last) return;
    const b = bets.get(last.key);
    if (!b) return renderChips();
    b.amount -= last.amount;
    if (b.amount <= 0) bets.delete(last.key);
    renderChips();
  });
  clear.addEventListener('click', () => {
    if (spinning) return;
    bets.clear();
    history.length = 0;
    renderChips();
  });
  doubleAll.addEventListener('click', () => {
    if (spinning) return;
    for (const [key, b] of bets) {
      history.push({ key, amount: b.amount });
      b.amount *= 2;
    }
    renderChips();
  });

  let ctx;
  let size = 300;
  let angle = 0;
  let spinning = false;
  let raf = 0;
  let alive = true;
  const segA = (Math.PI * 2) / ORDER.length;

  function drawWheel(ballAngle = null) {
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(r, r);
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ORDER.forEach((n, i) => {
      const a0 = -Math.PI / 2 + i * segA - segA / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r - 12, a0, a0 + segA);
      ctx.closePath();
      ctx.fillStyle = FILL[colorOf(n)];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + segA / 2);
      ctx.translate(r - 26, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.max(8, size / 30)}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(String(n), 0, 4);
      ctx.restore();
    });
    ctx.fillStyle = '#10131f';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a24a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (ballAngle !== null) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r + Math.cos(ballAngle) * (r - 40), r + Math.sin(ballAngle) * (r - 40), Math.max(4, size / 42), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#21f3a3';
    ctx.beginPath();
    ctx.moveTo(r - 9, 0);
    ctx.lineTo(r + 9, 0);
    ctx.lineTo(r, 16);
    ctx.closePath();
    ctx.fill();
  }

  function resize() {
    size = Math.min(300, canvas.parentElement.clientWidth || 300);
    canvas.style.width = `${size}px`;
    ctx = setupCanvas(canvas, size, size);
    drawWheel(spinning ? null : -Math.PI / 2);
  }

  function animateTo(number) {
    return new Promise((resolve) => {
      const idx = ORDER.indexOf(number);
      const start = angle;
      const base = -idx * segA;
      const turns = Math.PI * 2 * 5;
      let end = base - turns;
      while (end > start - turns) end -= Math.PI * 2;
      const t0 = performance.now();
      const dur = 4200;
      const step = (now) => {
        if (!alive) return resolve();
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - p) ** 3;
        angle = start + (end - start) * e;
        const ballA = -Math.PI / 2 + (1 - e) * Math.PI * 8;
        drawWheel(ballA);
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          angle = ((end % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          drawWheel(-Math.PI / 2);
          resolve();
        }
      };
      raf = requestAnimationFrame(step);
    });
  }

  spin.addEventListener('click', async () => {
    if (spinning) return;
    const list = [...bets.values()];
    if (!list.length) return toastError(new Error('Place a chip on the board first'));
    if (total() > state.user.balance) return toastError(new Error('Insufficient balance. Deposit to keep playing.'));
    spinning = true;
    spin.disabled = true;
    cells.forEach((el) => el.classList.remove('winner'));
    banner.textContent = '';
    try {
      const r = await api('/games/roulette', { method: 'POST', body: { bets: list.map((b) => ({ type: b.type, value: b.value, amount: b.amount })) } });
      await animateTo(r.number);
      numEl.textContent = String(r.number);
      numEl.style.background = FILL[r.color];
      cells.get(keyOf('straight', r.number))?.classList.add('winner');
      const net = r.payout - r.wager;
      banner.className = `result-banner ${net > 0 ? 'win' : net < 0 ? 'lose' : ''}`;
      banner.textContent = r.payout > 0 ? `Won ${money(r.payout)} (${net >= 0 ? '+' : '−'}${money(Math.abs(net))})` : `No win · −${money(r.wager)}`;
      setBalance(r.balance);
      celebrate(r);
    } catch (err) {
      toastError(err);
    } finally {
      spinning = false;
      spin.disabled = false;
    }
  });

  window.addEventListener('resize', resize);
  resize();
  renderChips();
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
