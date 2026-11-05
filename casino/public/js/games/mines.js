import { api, h, money, fmtMult, betControl, stat, gameShell, setBalance, toastError } from '../core.js';

export function mountMines(view) {
  const { root, panel, stage } = gameShell('Mines', 'Reveal gems for a bigger multiplier. Hit a mine and it is over.');
  const bet = betControl(100);
  const minesSelect = h('select', {}, Array.from({ length: 24 }, (_, i) => h('option', { value: i + 1, selected: i + 1 === 3 }, String(i + 1))));
  const button = h('button', { class: 'btn btn-primary btn-block' }, 'Start game');
  const pick = h('button', { class: 'btn btn-ghost btn-block hidden', style: { marginTop: '8px' } }, 'Pick random tile');
  const curMult = stat('Multiplier', '1.00x');
  const nextMult = stat('Next tile', '—');
  const payout = stat('Cash-out value', '—');
  const banner = h('div', { class: 'result-banner' });
  const grid = h('div', { class: 'mines-grid' });
  const tiles = Array.from({ length: 25 }, (_, i) => {
    const t = h('button', { class: 'tile', disabled: true, 'aria-label': `Tile ${i + 1}` });
    t.addEventListener('click', () => reveal(i));
    grid.append(t);
    return t;
  });

  panel.append(bet.el, h('div', { class: 'field' }, h('label', {}, 'Mines'), minesSelect), button, pick);
  stage.append(h('div', { class: 'stat-row' }, curMult.el, nextMult.el, payout.el), grid, banner);
  view.append(root);

  let game = null;
  let busy = false;

  function resetTiles() {
    tiles.forEach((t) => { t.className = 'tile'; t.textContent = ''; t.disabled = true; });
  }

  function renderActive(g) {
    game = g;
    tiles.forEach((t, i) => {
      const shown = g.revealed.includes(i);
      t.className = shown ? 'tile gem' : 'tile';
      t.textContent = shown ? '💎' : '';
      t.disabled = shown;
    });
    curMult.set(fmtMult(g.multiplier));
    nextMult.set(fmtMult(g.nextMultiplier));
    payout.set(g.revealed.length ? money(Math.floor(g.wager * g.multiplier)) : '—');
    button.className = 'btn btn-primary btn-block';
    button.textContent = g.revealed.length ? `Cash out ${money(Math.floor(g.wager * g.multiplier))}` : 'Pick a tile…';
    button.disabled = g.revealed.length === 0;
    pick.classList.remove('hidden');
    bet.disable(true);
    minesSelect.disabled = true;
    banner.textContent = '';
    banner.className = 'result-banner';
  }

  function renderEnd(r) {
    game = null;
    tiles.forEach((t, i) => {
      const isMine = r.mines.includes(i);
      const picked = r.revealed.includes(i);
      t.disabled = true;
      t.className = `tile ${isMine ? 'mine' : 'gem'} ${picked ? '' : 'dim'}`;
      t.textContent = isMine ? '💣' : '💎';
    });
    curMult.set(fmtMult(r.multiplier));
    nextMult.set('—');
    payout.set(money(r.payout));
    banner.className = `result-banner ${r.hitMine ? 'lose' : 'win'}`;
    banner.textContent = r.hitMine ? `Boom. Lost ${money(r.wager)}` : `Cashed out ${money(r.payout)} (${fmtMult(r.multiplier)})`;
    button.className = 'btn btn-primary btn-block';
    button.textContent = 'Start game';
    button.disabled = false;
    pick.classList.add('hidden');
    bet.disable(false);
    minesSelect.disabled = false;
    setBalance(r.balance);
  }

  async function reveal(tile) {
    if (!game || busy) return;
    busy = true;
    try {
      const r = await api('/games/mines/reveal', { method: 'POST', body: { tile } });
      if (r.active) renderActive(r);
      else renderEnd(r);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  pick.addEventListener('click', () => {
    if (!game) return;
    const hidden = tiles.map((_, i) => i).filter((i) => !game.revealed.includes(i));
    reveal(hidden[Math.floor(Math.random() * hidden.length)]);
  });

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (game) {
        renderEnd(await api('/games/mines/cashout', { method: 'POST' }));
      } else {
        const wager = bet.validate();
        resetTiles();
        const r = await api('/games/mines/start', { method: 'POST', body: { wager, mines: Number(minesSelect.value) } });
        setBalance(r.balance);
        renderActive(r);
      }
    } catch (err) {
      toastError(err);
      if (!game) button.disabled = false;
    } finally {
      busy = false;
      if (game) button.disabled = game.revealed.length === 0;
    }
  });

  api('/games/mines/state').then((r) => {
    if (r.active) {
      minesSelect.value = r.mineCount;
      bet.input.value = (r.wager / 100).toFixed(2);
      renderActive(r);
    }
  }).catch(() => {});
}
