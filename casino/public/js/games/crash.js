import { api, h, money, fmtMult, betControl, stat, gameShell, setBalance, setupCanvas, toastError, celebrate, sfx } from '../core.js';

const GROWTH = 0.00006;
const multAt = (ms) => Math.floor(100 * Math.exp(GROWTH * Math.max(0, ms))) / 100;
const msTo = (m) => Math.log(m) / GROWTH;

export function mountCrash(view) {
  const { root, panel, stage } = gameShell('Crash', 'The multiplier climbs until it busts. Cash out in time.');
  const bet = betControl(100);
  const auto = h('input', { type: 'number', min: 1.01, step: 0.01, placeholder: 'Off (manual)' });
  const button = h('button', { class: 'btn btn-primary btn-block' }, 'Place bet');
  const potential = stat('Current payout', '—');
  const chips = h('div', { class: 'history-chips' });
  const canvas = h('canvas', { class: 'crash-canvas' });
  const multEl = h('div', { class: 'crash-mult' }, '1.00x');
  const sub = h('div', { class: 'crash-sub' }, 'Place a bet to launch');
  const overlay = h('div', { class: 'crash-overlay' }, h('div', {}, multEl, sub));
  const wrap = h('div', { style: { position: 'relative' } }, canvas, overlay);

  panel.append(bet.el, h('div', { class: 'field' }, h('label', {}, 'Auto cash-out (optional)'), auto), button, h('div', { class: 'stat-row' }, potential.el));
  stage.append(chips, wrap);
  view.append(root);

  let ctx;
  let W = 0;
  const H = 380;
  const resize = () => {
    W = wrap.clientWidth;
    ctx = setupCanvas(canvas, W, H);
    draw();
  };

  let phase = 'idle';
  let localStart = 0;
  let wager = 0;
  let finalMult = 1;
  let finalState = null;
  let raf = 0;
  let poll = 0;
  let busy = false;
  let alive = true;

  function curveMs() {
    if (phase === 'running') return performance.now() - localStart;
    if (phase === 'ended') return msTo(finalMult);
    return 0;
  }

  function draw() {
    if (!ctx) return;
    const t = curveMs();
    const m = phase === 'ended' ? finalMult : multAt(t);
    const pad = { l: 46, r: 16, t: 20, b: 30 };
    const maxT = Math.max(8000, t * 1.15);
    const maxM = Math.max(2, m * 1.2);
    const x = (ms) => pad.l + (ms / maxT) * (W - pad.l - pad.r);
    const y = (mv) => H - pad.b - ((mv - 1) / (maxM - 1)) * (H - pad.t - pad.b);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(138,146,178,.15)';
    ctx.fillStyle = '#8a92b2';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.lineWidth = 1;
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const mv = 1 + ((maxM - 1) * i) / ySteps;
      ctx.beginPath();
      ctx.moveTo(pad.l, y(mv));
      ctx.lineTo(W - pad.r, y(mv));
      ctx.stroke();
      ctx.fillText(`${mv.toFixed(1)}x`, 4, y(mv) + 4);
    }
    const sStep = Math.max(2, Math.ceil(maxT / 1000 / 6));
    for (let s = 0; s * 1000 <= maxT; s += sStep) ctx.fillText(`${s}s`, x(s * 1000) - 6, H - 8);
    if (phase === 'idle') return;
    const color = phase === 'ended' && !finalState?.cashedOutAt ? '#ff4d6d' : '#21f3a3';
    const grad = ctx.createLinearGradient(0, y(m), 0, H - pad.b);
    grad.addColorStop(0, color === '#21f3a3' ? 'rgba(33,243,163,.35)' : 'rgba(255,77,109,.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), y(1));
    const steps = 80;
    for (let i = 1; i <= steps; i++) {
      const ms = (t * i) / steps;
      ctx.lineTo(x(ms), y(Math.exp(GROWTH * ms)));
    }
    ctx.lineTo(x(t), H - pad.b);
    ctx.lineTo(x(0), H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x(0), y(1));
    for (let i = 1; i <= steps; i++) {
      const ms = (t * i) / steps;
      ctx.lineTo(x(ms), y(Math.exp(GROWTH * ms)));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = '26px serif';
    ctx.fillText(phase === 'ended' && !finalState?.cashedOutAt ? '💥' : '🚀', x(t) - 13, y(Math.exp(GROWTH * t)) - 6);
  }

  function frame() {
    if (!alive) return;
    if (phase === 'running') {
      const m = multAt(performance.now() - localStart);
      multEl.textContent = fmtMult(m);
      potential.set(money(Math.floor(wager * m)));
      button.textContent = `Cash out ${money(Math.floor(wager * m))}`;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function setRunning(r) {
    phase = 'running';
    wager = r.wager;
    localStart = performance.now() - r.elapsed;
    multEl.className = 'crash-mult';
    sub.textContent = r.autoCashout ? `Auto cash-out at ${fmtMult(r.autoCashout)}` : 'Cash out any time';
    button.className = 'btn btn-danger btn-block';
    bet.disable(true);
    auto.disabled = true;
    clearInterval(poll);
    poll = setInterval(checkState, 250);
  }

  function setEnded(r) {
    clearInterval(poll);
    phase = 'ended';
    finalState = r;
    finalMult = r.crashPoint;
    multEl.textContent = fmtMult(r.crashPoint);
    if (r.cashedOutAt) {
      multEl.className = 'crash-mult cashed';
      sub.textContent = `Cashed out at ${fmtMult(r.cashedOutAt)} · +${money(r.payout - r.wager)} · busted at ${fmtMult(r.crashPoint)}`;
    } else {
      multEl.className = 'crash-mult busted';
      sub.textContent = `Busted at ${fmtMult(r.crashPoint)} · −${money(r.wager)}`;
    }
    potential.set(money(r.payout));
    button.className = 'btn btn-primary btn-block';
    button.textContent = 'Place bet';
    bet.disable(false);
    auto.disabled = false;
    setBalance(r.balance);
    addChip(r.crashPoint, true);
    if (r.cashedOutAt) celebrate(r);
    else sfx.boom();
  }

  async function checkState() {
    if (busy || phase !== 'running') return;
    try {
      const r = await api('/games/crash/state');
      if (phase === 'running' && !r.active && r.crashPoint) setEnded(r);
      else if (!r.active) {
        phase = 'idle';
        clearInterval(poll);
      }
    } catch (err) {
      if (err.status === 401) clearInterval(poll);
    }
  }

  function addChip(m, prepend) {
    const el = h('span', { class: m >= 2 ? 'hi' : 'lo' }, fmtMult(m));
    if (prepend) chips.prepend(el);
    else chips.append(el);
    while (chips.children.length > 14) chips.lastChild.remove();
  }

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (phase === 'running') {
        const r = await api('/games/crash/cashout', { method: 'POST' });
        setEnded(r);
      } else {
        const w = bet.validate();
        const a = auto.value ? Number(auto.value) : null;
        if (a !== null && !(a >= 1.01)) throw new Error('Auto cash-out must be at least 1.01x');
        const r = await api('/games/crash/start', { method: 'POST', body: { wager: w, autoCashout: a } });
        setBalance(r.balance);
        sfx.click();
        setRunning(r);
      }
    } catch (err) {
      if (phase !== 'ended') toastError(err);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);

  api('/bets?game=crash&limit=14').then(({ bets }) => bets.forEach((b) => addChip(b.detail.crashPoint, false))).catch(() => {});
  api('/games/crash/state').then((r) => {
    if (r.active) setRunning(r);
  }).catch(() => {});

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearInterval(poll);
    window.removeEventListener('resize', resize);
  };
}
