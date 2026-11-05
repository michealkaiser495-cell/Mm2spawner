import { api, h, money, fmtMult, betControl, seg, gameShell, setBalance, setupCanvas, toastError } from '../core.js';

const TABLES = {
  8: { low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

function bucketColor(i, n) {
  const d = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  const hue = 50 - d * 50;
  return `hsl(${hue}, 95%, ${55 - d * 5}%)`;
}

export function mountPlinko(view) {
  const { root, panel, stage } = gameShell('Plinko', 'Drop the ball. Edges pay big, the middle pays small.');
  const bet = betControl(100);
  let rows = 16;
  let risk = 'medium';
  const rowsSeg = seg([[8, '8'], [12, '12'], [16, '16']], 16, (v) => { rows = v; layout(); });
  const riskSeg = seg([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'medium', (v) => { risk = v; layout(); });
  const button = h('button', { class: 'btn btn-primary btn-block' }, 'Drop ball');
  const last = h('div', { class: 'history-chips' });
  const canvas = h('canvas', { class: 'plinko-canvas' });

  panel.append(bet.el, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg.el), h('div', { class: 'field' }, h('label', {}, 'Rows'), rowsSeg.el), button);
  stage.append(last, canvas);
  view.append(root);

  let ctx;
  let W = 0;
  let H = 0;
  let geo = null;
  const balls = [];
  const hits = new Map();
  let latestBetId = 0;
  let raf = 0;
  let alive = true;
  let inFlight = 0;

  function layout() {
    W = stage.clientWidth - 44 > 0 ? stage.clientWidth - 44 : 600;
    H = Math.min(600, Math.max(340, W * 0.9));
    ctx = setupCanvas(canvas, W, H);
    const top = 30;
    const bucketH = 34;
    const spacing = Math.min((W - 20) / (rows + 2), (H - top - bucketH - 30) / rows);
    geo = { top, spacing, cx: W / 2, rowH: spacing, bucketY: top + rows * spacing + 10, bucketH, rows, risk };
    const busy = balls.length > 0;
    rowsSeg.disable(busy);
    riskSeg.disable(busy);
  }

  const pegX = (i, j) => geo.cx + (j - (i + 2) / 2) * geo.spacing;
  const pegY = (i) => geo.top + i * geo.rowH;
  const bucketX = (b, n) => geo.cx + (b - n / 2) * geo.spacing;

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const { rows: R } = geo;
    ctx.fillStyle = '#c8cde4';
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < i + 3; j++) {
        ctx.beginPath();
        ctx.arc(pegX(i, j), pegY(i), Math.max(2.5, geo.spacing * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const table = TABLES[R][geo.risk];
    const bw = geo.spacing - 4;
    table.forEach((m, b) => {
      const x = bucketX(b, R) - bw / 2;
      const hitAt = hits.get(b);
      const bounce = hitAt && now - hitAt < 250 ? Math.sin(((now - hitAt) / 250) * Math.PI) * 6 : 0;
      ctx.fillStyle = bucketColor(b, table.length);
      ctx.beginPath();
      ctx.roundRect(x, geo.bucketY + bounce, bw, geo.bucketH, 6);
      ctx.fill();
      ctx.fillStyle = '#1a1300';
      ctx.font = `700 ${Math.max(9, Math.min(13, bw / 3.6))}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(m >= 100 ? `${m}` : `${m}x`, x + bw / 2, geo.bucketY + bounce + geo.bucketH / 2 + 4);
    });
    const radius = Math.max(4, geo.spacing * 0.22);
    for (const ball of balls) {
      const p = ballPos(ball, now);
      const g = ctx.createRadialGradient(p.x - radius / 3, p.y - radius / 3, 1, p.x, p.y, radius);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#ff4d9a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const STEP = 115;
  function ballPos(ball, now) {
    const t = (now - ball.start) / STEP;
    const R = ball.path.length;
    const k = Math.min(R, Math.max(0, Math.floor(t)));
    const frac = Math.min(1, t - k);
    const rightsBefore = ball.path.slice(0, k).reduce((a, b) => a + b, 0);
    const xAt = (n, r) => geo.cx + (r - n / 2) * geo.spacing;
    const yAt = (n) => geo.top - geo.rowH * 0.6 + n * geo.rowH;
    if (k >= R) return { x: xAt(R, rightsBefore), y: Math.min(geo.bucketY + 8, yAt(R) + frac * geo.rowH * 0.5) };
    const x0 = xAt(k, rightsBefore);
    const x1 = xAt(k + 1, rightsBefore + ball.path[k]);
    const y0 = yAt(k);
    const y1 = yAt(k + 1);
    const hop = Math.sin(frac * Math.PI) * geo.rowH * 0.35;
    return { x: x0 + (x1 - x0) * frac, y: y0 + (y1 - y0) * frac * frac - hop * (1 - frac) };
  }

  function frame(now) {
    if (!alive) return;
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (now - ball.start >= STEP * (ball.path.length + 0.6)) {
        balls.splice(i, 1);
        hits.set(ball.res.bucket, now);
        land(ball.res);
      }
    }
    if (balls.length === 0 && inFlight === 0) {
      rowsSeg.disable(false);
      riskSeg.disable(false);
    }
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function land(r) {
    const el = h('span', { class: r.multiplier >= 1 ? 'hi' : 'lo' }, fmtMult(r.multiplier));
    last.prepend(el);
    while (last.children.length > 14) last.lastChild.remove();
    if (r.betId === latestBetId) setBalance(r.balance);
  }

  button.addEventListener('click', async () => {
    let wager;
    try {
      wager = bet.validate();
    } catch (err) {
      return toastError(err);
    }
    if (geo.rows !== rows || geo.risk !== risk) layout();
    rowsSeg.disable(true);
    riskSeg.disable(true);
    inFlight++;
    try {
      const r = await api('/games/plinko', { method: 'POST', body: { wager, rows, risk } });
      latestBetId = Math.max(latestBetId, r.betId);
      balls.push({ path: r.path, start: performance.now(), res: r });
    } catch (err) {
      toastError(err);
    } finally {
      inFlight--;
    }
  });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  layout();
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
  };
}
