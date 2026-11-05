import { api, h, money, fmtMult, betControl, seg, stat, gameShell, setBalance, toastError } from '../core.js';

export function mountDice(view) {
  const { root, panel, stage } = gameShell('Dice', 'Roll under or over your target. 1% house edge.');
  const bet = betControl(100);
  let direction = 'under';
  const dir = seg([['under', 'Roll under'], ['over', 'Roll over']], 'under', (v) => { direction = v; update(); });
  const slider = h('input', { type: 'range', min: 2, max: 98, step: 0.5, value: 50 });
  const targetInput = h('input', { type: 'number', min: 2, max: 98, step: 0.01, value: '50.00' });
  const mult = stat('Multiplier');
  const chance = stat('Win chance');
  const profit = stat('Profit on win');
  const button = h('button', { class: 'btn btn-primary btn-block' }, 'Roll dice');

  const result = h('div', { class: 'dice-result' }, '50.00');
  const banner = h('div', { class: 'result-banner' });
  const track = h('div', { class: 'dice-track' });
  const marker = h('div', { class: 'dice-marker', style: { left: '50%' } }, '—');
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

  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    let wager;
    try {
      wager = bet.validate();
      if (target() < 2 || target() > 98) throw new Error('Target must be between 2 and 98');
    } catch (err) {
      return toastError(err);
    }
    busy = true;
    button.disabled = true;
    try {
      const r = await api('/games/dice', { method: 'POST', body: { wager, target: target(), direction } });
      result.textContent = r.roll.toFixed(2);
      result.className = `dice-result ${r.win ? 'win' : 'lose'}`;
      marker.style.left = `${r.roll}%`;
      marker.textContent = r.roll.toFixed(2);
      banner.className = `result-banner ${r.win ? 'win' : 'lose'}`;
      banner.textContent = r.win ? `You won ${money(r.payout)} (${fmtMult(r.multiplier)})` : `Lost ${money(r.wager)}`;
      setBalance(r.balance);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  panel.append(
    bet.el,
    h('div', { class: 'field' }, h('label', {}, 'Direction'), dir.el),
    h('div', { class: 'field' }, h('label', {}, 'Target'), targetInput, slider),
    button,
  );
  stage.append(
    h('div', { class: 'stat-row' }, mult.el, chance.el, profit.el),
    result, banner, track,
    h('div', { class: 'dice-scale' }, ['0', '25', '50', '75', '100'].map((x) => h('span', {}, x))),
  );
  view.append(root);
  update();

  const onKey = (e) => {
    if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      button.click();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
