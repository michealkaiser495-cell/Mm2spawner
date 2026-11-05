import { state, api, h, money, toCents, fmtMult, betControl, seg, stat, gameShell, setBalance, toastError, celebrate, sfx, sleep } from '../core.js';

export function mountDice(view) {
  const { root, panel, stage } = gameShell('Dice', 'Roll under or over your target. 1% house edge.');
  const bet = betControl(100);
  let direction = 'under';
  let mode = 'manual';
  const modeSeg = seg([['manual', 'Manual'], ['auto', 'Auto']], 'manual', (v) => { mode = v; autoBox.classList.toggle('hidden', v !== 'auto'); button.textContent = v === 'auto' ? 'Start auto' : 'Roll dice'; });
  const dir = seg([['under', 'Roll under'], ['over', 'Roll over']], 'under', (v) => { direction = v; update(); });
  const slider = h('input', { type: 'range', min: 2, max: 98, step: 0.5, value: 50, 'aria-label': 'Target' });
  const targetInput = h('input', { type: 'number', min: 2, max: 98, step: 0.01, value: '50.00' });
  const mult = stat('Multiplier');
  const chance = stat('Win chance');
  const profit = stat('Profit on win');
  const button = h('button', { class: 'btn btn-primary btn-block' }, 'Roll dice');

  const num = (attrs) => h('input', { type: 'number', min: 0, step: attrs.step || 1, value: attrs.value ?? '', placeholder: attrs.placeholder || '' });
  const autoCount = num({ value: 10 });
  const onWin = num({ value: 0, step: 1 });
  const onLoss = num({ value: 0, step: 1 });
  const stopProfit = num({ step: 0.01, placeholder: 'Off' });
  const stopLoss = num({ step: 0.01, placeholder: 'Off' });
  const autoStats = h('div', { class: 'muted', style: { fontSize: '13px', minHeight: '20px' } });
  const autoBox = h('div', { class: 'hidden' },
    h('div', { class: 'two-col', style: { gap: '10px' } },
      h('div', { class: 'field' }, h('label', {}, 'Number of bets (0 = ∞)'), autoCount),
      h('div', { class: 'field' }, h('label', {}, 'Stop on profit ($)'), stopProfit),
      h('div', { class: 'field' }, h('label', {}, 'On win: raise bet %'), onWin),
      h('div', { class: 'field' }, h('label', {}, 'Stop on loss ($)'), stopLoss),
      h('div', { class: 'field' }, h('label', {}, 'On loss: raise bet %'), onLoss),
    ),
    autoStats,
  );

  const result = h('div', { class: 'dice-result' }, '50.00');
  const banner = h('div', { class: 'result-banner' });
  const track = h('div', { class: 'dice-track' });
  const marker = h('div', { class: 'dice-marker', style: { left: '50%' } }, '—');
  const recent = h('div', { class: 'history-chips' });
  track.append(marker);

  const target = () => Math.round(Number(targetInput.value) * 100) / 100;
  function update() {
    const t = Math.min(98, Math.max(2, target() || 50));
    const c = direction === 'under' ? t : 100 - t;
    const m = Math.floor((99 / c) * 10000) / 10000;
    mult.set(fmtMult(m));
    chance.set(`${c.toFixed(2)}%`);
    const b = bet.get();
    profit.set(Number.isFinite(b) ? money(Math.floor(b * m) - b) : '—');
    const win = 'var(--accent)';
    const lose = 'var(--danger)';
    track.style.background = direction === 'under'
      ? `linear-gradient(90deg, ${win} 0 ${t}%, ${lose} ${t}% 100%)`
      : `linear-gradient(90deg, ${lose} 0 ${t}%, ${win} ${t}% 100%)`;
  }
  slider.addEventListener('input', () => { targetInput.value = Number(slider.value).toFixed(2); update(); });
  targetInput.addEventListener('input', () => { slider.value = targetInput.value; update(); });
  bet.input.addEventListener('input', update);

  function show(r) {
    result.textContent = r.roll.toFixed(2);
    result.className = `dice-result ${r.win ? 'win' : 'lose'}`;
    marker.style.left = `${r.roll}%`;
    marker.textContent = r.roll.toFixed(2);
    banner.className = `result-banner ${r.win ? 'win' : 'lose'}`;
    banner.textContent = r.win ? `You won ${money(r.payout)} (${fmtMult(r.multiplier)})` : `Lost ${money(r.wager)}`;
    recent.prepend(h('span', { class: r.win ? 'hi' : 'lo' }, r.roll.toFixed(2)));
    while (recent.children.length > 16) recent.lastChild.remove();
    setBalance(r.balance);
    celebrate(r);
  }

  async function rollOnce(wager) {
    const t = target();
    if (t < 2 || t > 98) throw new Error('Target must be between 2 and 98');
    const r = await api('/games/dice', { method: 'POST', body: { wager, target: t, direction } });
    show(r);
    return r;
  }

  let busy = false;
  let auto = false;
  let alive = true;

  function lock(flag) {
    bet.disable(flag);
    dir.disable(flag);
    modeSeg.disable(flag);
    slider.disabled = flag;
    targetInput.disabled = flag;
    autoBox.querySelectorAll('input').forEach((x) => { x.disabled = flag; });
  }

  async function runAuto() {
    let wager;
    try {
      wager = bet.validate();
    } catch (err) {
      return toastError(err);
    }
    const base = wager;
    const count = Math.max(0, Math.floor(Number(autoCount.value) || 0));
    const winPct = Math.max(0, Number(onWin.value) || 0);
    const lossPct = Math.max(0, Number(onLoss.value) || 0);
    const sp = stopProfit.value ? toCents(stopProfit.value) : null;
    const sl = stopLoss.value ? toCents(stopLoss.value) : null;
    auto = true;
    lock(true);
    button.className = 'btn btn-danger btn-block';
    button.textContent = 'Stop auto';
    let net = 0;
    let n = 0;
    try {
      while (auto && alive && (count === 0 || n < count)) {
        if (wager > state.user.balance) throw new Error('Insufficient balance. Auto-bet stopped.');
        const r = await rollOnce(wager);
        n++;
        net += r.payout - r.wager;
        autoStats.textContent = `Bets ${n}${count ? `/${count}` : ''} · Profit ${net >= 0 ? '+' : '−'}${money(Math.abs(net))}`;
        if (sp !== null && net >= sp) break;
        if (sl !== null && -net >= sl) break;
        const pct = r.win ? winPct : lossPct;
        wager = pct > 0 ? Math.min(state.config.maxBet, Math.round(wager * (1 + pct / 100))) : base;
        bet.input.value = (wager / 100).toFixed(2);
        update();
        await sleep(260);
      }
    } catch (err) {
      toastError(err);
    } finally {
      auto = false;
      if (alive) {
        bet.input.value = (base / 100).toFixed(2);
        update();
        lock(false);
        button.className = 'btn btn-primary btn-block';
        button.textContent = 'Start auto';
      }
    }
  }

  button.addEventListener('click', async () => {
    if (mode === 'auto') {
      if (auto) {
        auto = false;
        return;
      }
      return runAuto();
    }
    if (busy) return;
    let wager;
    try {
      wager = bet.validate();
    } catch (err) {
      return toastError(err);
    }
    busy = true;
    button.disabled = true;
    sfx.click();
    try {
      await rollOnce(wager);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  panel.append(
    h('div', { class: 'field' }, modeSeg.el),
    bet.el,
    h('div', { class: 'field' }, h('label', {}, 'Direction'), dir.el),
    h('div', { class: 'field' }, h('label', {}, 'Target'), targetInput, slider),
    autoBox,
    button,
  );
  stage.append(
    recent,
    h('div', { class: 'stat-row' }, mult.el, chance.el, profit.el),
    result, banner, track,
    h('div', { class: 'dice-scale' }, ['0', '25', '50', '75', '100'].map((x) => h('span', {}, x))),
  );
  view.append(root);
  update();

  api('/bets?game=dice&limit=16').then(({ bets }) => bets.forEach((b) => recent.append(h('span', { class: b.payout > 0 ? 'hi' : 'lo' }, b.detail.roll.toFixed(2))))).catch(() => {});

  const onKey = (e) => {
    if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && mode === 'manual') {
      e.preventDefault();
      button.click();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    alive = false;
    auto = false;
    window.removeEventListener('keydown', onKey);
  };
}
