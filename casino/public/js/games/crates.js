import { state, api, h, money, fmtMult, setBalance, toastError, celebrate, sfx } from '../core.js';

const WIN_INDEX = 46;
const STRIP = 54;

function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.chance, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.chance;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

function tile(item) {
  return h('div', { class: `crate-tile r-${item.rarity}` },
    h('div', { class: 'ct-icon' }, item.icon),
    h('div', { class: 'ct-name' }, item.name),
    h('div', { class: 'ct-val mono' }, money(item.value)),
  );
}

export function mountCrates(view) {
  let catalog = [];
  let selected = null;
  let quantity = 1;
  let busy = false;
  let fast = false;
  const timers = new Set();
  let alive = true;

  const crateRow = h('div', { class: 'crate-row' });
  const qty = h('div', { class: 'seg' });
  const qtyButtons = [1, 2, 3, 4, 5].map((n) => {
    const b = h('button', { type: 'button', class: n === 1 ? 'active' : '' }, `${n}×`);
    b.addEventListener('click', () => {
      if (busy) return;
      quantity = n;
      qtyButtons.forEach((x) => x.classList.toggle('active', x === b));
      update();
    });
    qty.append(b);
    return b;
  });
  const fastBox = h('input', { type: 'checkbox', id: 'crate-fast' });
  fastBox.addEventListener('change', () => { fast = fastBox.checked; });
  const openBtn = h('button', { class: 'btn btn-primary btn-block' }, 'Open');
  const reels = h('div', { class: 'reels' });
  const summary = h('div', { class: 'result-banner' });
  const contents = h('div', { class: 'crate-contents' });
  const contentsTitle = h('h2', {}, 'Contents');
  const rtpEl = h('span', { class: 'muted', style: { fontSize: '13px', fontWeight: 600 } });

  view.append(
    h('div', { class: 'game-head' },
      h('div', {}, h('h1', {}, 'Crates'), h('div', { class: 'muted' }, 'Buy a crate, spin the reel, win what lands. Bigger crates hold bigger prizes and pay back more.')),
      h('a', { href: '#/fair', class: 'btn btn-ghost btn-sm' }, 'Fairness')),
    crateRow,
    h('div', { class: 'crate-controls panel' },
      h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'Quantity'), qty),
      h('label', { class: 'check', for: 'crate-fast', style: { margin: 0 } }, fastBox, h('span', {}, 'Fast open')),
      h('div', { style: { minWidth: '220px', flex: 1 } }, openBtn),
    ),
    h('div', { class: 'stage reel-stage' }, reels, summary),
    h('div', { class: 'section-title' }, contentsTitle, rtpEl),
    contents,
  );

  function update(resetReels = true) {
    if (!selected) return;
    crateRow.querySelectorAll('.crate-card').forEach((el) => el.classList.toggle('active', el.dataset.id === selected.id));
    const cost = selected.price * quantity;
    openBtn.textContent = `Open ${quantity} for ${money(cost)}`;
    openBtn.disabled = busy;
    contentsTitle.textContent = `${selected.name} contents`;
    rtpEl.textContent = `Returns ${selected.rtp}% on average`;
    contents.replaceChildren(...[...selected.items].reverse().map((it) => h('div', { class: `crate-item r-${it.rarity}` },
      h('div', { class: 'ci-icon' }, it.icon),
      h('div', { class: 'ci-body' }, h('div', { class: 'ci-name' }, it.name), h('div', { class: 'ci-rarity' }, it.rarity)),
      h('div', { class: 'ci-right' }, h('div', { class: 'mono ci-val' }, money(it.value)), h('div', { class: 'muted mono ci-odds' }, `${it.chance < 0.01 ? it.chance.toFixed(4) : it.chance.toFixed(2)}% · ${fmtMult(it.mult)}`)),
    )));
    if (!busy && resetReels) idleReels();
  }

  function idleReels() {
    reels.replaceChildren(...Array.from({ length: quantity }, () => {
      const strip = h('div', { class: 'reel-strip' }, Array.from({ length: 9 }, () => tile(weightedPick(selected.items))));
      return h('div', { class: 'reel' }, strip, h('div', { class: 'reel-marker' }));
    }));
    summary.textContent = '';
    summary.className = 'result-banner';
  }

  function spinReel(reelEl, winner, duration) {
    return new Promise((resolve) => {
      const items = Array.from({ length: STRIP }, (_, i) => (i === WIN_INDEX ? winner : weightedPick(selected.items)));
      const tiles = items.map(tile);
      const strip = h('div', { class: 'reel-strip' }, tiles);
      reelEl.replaceChildren(strip, h('div', { class: 'reel-marker' }));
      const width = reelEl.clientWidth;
      const step = tiles[1].getBoundingClientRect().left - tiles[0].getBoundingClientRect().left;
      const first = tiles[0].offsetLeft;
      const jitter = (Math.random() - 0.5) * (step - 30);
      const target = first + WIN_INDEX * step + (step - 8) / 2 - width / 2 + jitter;
      strip.style.transform = 'translateX(0px)';
      void strip.offsetWidth;
      strip.style.transition = `transform ${duration}ms cubic-bezier(.12,.75,.16,1)`;
      strip.style.transform = `translateX(${-target}px)`;
      let lastIdx = -1;
      const watch = () => {
        if (!alive) return;
        const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const idx = Math.floor((-m.m41 + width / 2 - first) / step);
        if (idx !== lastIdx) {
          lastIdx = idx;
          if (duration > 400) sfx.tick();
        }
        if (strip.dataset.done !== '1') requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      const t = setTimeout(() => {
        timers.delete(t);
        strip.dataset.done = '1';
        tiles[WIN_INDEX].classList.add('won');
        resolve();
      }, duration + 60);
      timers.add(t);
    });
  }

  openBtn.addEventListener('click', async () => {
    if (busy || !selected) return;
    const cost = selected.price * quantity;
    if (state.user.balance < cost) return toastError(new Error('Insufficient balance. Deposit to keep playing.'));
    busy = true;
    openBtn.disabled = true;
    summary.textContent = '';
    try {
      const r = await api('/games/crates/open', { method: 'POST', body: { crate: selected.id, quantity } });
      idleReels();
      const reelEls = [...reels.children];
      const dur = fast ? 350 : 5200;
      await Promise.all(r.items.map((item, i) => spinReel(reelEls[i], item, dur + i * (fast ? 60 : 350))));
      if (!alive) return;
      const best = r.items.reduce((a, b) => (b.mult > a.mult ? b : a));
      const net = r.payout - r.wager;
      summary.className = `result-banner ${net > 0 ? 'win' : 'lose'}`;
      summary.textContent = `${r.items.length > 1 ? `Best pull: ${best.icon} ${best.name} · ` : `${best.icon} ${best.name} · `}won ${money(r.payout)} (${net >= 0 ? '+' : '−'}${money(Math.abs(net))})`;
      setBalance(r.balance);
      celebrate(r);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
      if (alive) update(false);
    }
  });

  api('/crates').then(({ crates }) => {
    catalog = crates;
    selected = catalog[0];
    crateRow.replaceChildren(...catalog.map((c) => {
      const card = h('button', { type: 'button', class: 'crate-card', 'data-id': c.id, style: { '--crate': c.color } },
        h('div', { class: 'crate-box' }, '📦'),
        h('div', { class: 'crate-name' }, c.name),
        h('div', { class: 'crate-price mono' }, money(c.price)),
        h('div', { class: 'crate-top muted' }, `Top prize ${money(c.items[c.items.length - 1].value)}`),
      );
      card.addEventListener('click', () => {
        if (busy) return;
        selected = c;
        sfx.click();
        update();
      });
      return card;
    }));
    update();
  }).catch(toastError);

  return () => {
    alive = false;
    timers.forEach(clearTimeout);
  };
}
