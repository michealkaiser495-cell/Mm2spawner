const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { floats, sha256 } = require('../src/fair');

const WEBHOOK_SECRET = 'whsec_test_secret';
const config = {
  siteName: 'Test Vault',
  baseUrl: 'http://localhost',
  currency: 'usd',
  signupBonus: 100000,
  minDeposit: 500,
  maxDeposit: 50000,
  dailyDepositLimit: 60000,
  stripeWebhookSecret: WEBHOOK_SECRET,
  secureCookies: false,
  trustProxy: false,
  rateLimit: false,
  minWithdraw: 1000,
  discordContact: 'wmz9',
  admins: new Set(['boss']),
};

const stripe = new Stripe('sk_test_dummy');
const sessions = new Map();
let sessionSeq = 0;
stripe.checkout.sessions.create = async (params) => {
  const id = `cs_test_${++sessionSeq}`;
  const s = { id, url: `https://checkout.stripe.com/c/pay/${id}`, amount_total: params.line_items[0].price_data.unit_amount, currency: 'usd', payment_status: 'unpaid', metadata: params.metadata, params };
  sessions.set(id, s);
  return s;
};
stripe.checkout.sessions.retrieve = async (id) => {
  if (!sessions.has(id)) throw new Error('No such session');
  return sessions.get(id);
};

let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, config, stripe });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

function client() {
  let cookie = '';
  return async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, headers: res.headers };
  };
}

let userCounter = 0;
async function newUser() {
  const c = client();
  const n = ++userCounter;
  const r = await c('/api/auth/signup', { method: 'POST', body: { username: `player${n}`, email: `p${n}@example.com`, password: 'hunter2hunter2', ageConfirmed: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, user: r.data.user };
}

const balanceOf = async (c) => (await c('/api/me')).data.user.balance;

test('signup validation and duplicate handling', async () => {
  const c = client();
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'ab', email: 'x@y.co', password: 'longenough', ageConfirmed: true } })).status, 400);
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'valid_name', email: 'nope', password: 'longenough', ageConfirmed: true } })).status, 400);
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'valid_name', email: 'a@b.co', password: 'short', ageConfirmed: true } })).status, 400);
  const noAge = await c('/api/auth/signup', { method: 'POST', body: { username: 'valid_name', email: 'a@b.co', password: 'longenough' } });
  assert.equal(noAge.status, 400);
  assert.match(noAge.data.error, /18/);
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'valid_name', email: 'a@b.co', password: 'longenough', ageConfirmed: true } })).status, 201);
  const dupe = await client()('/api/auth/signup', { method: 'POST', body: { username: 'VALID_NAME', email: 'z@b.co', password: 'longenough', ageConfirmed: true } });
  assert.equal(dupe.status, 409);
  const dupeEmail = await client()('/api/auth/signup', { method: 'POST', body: { username: 'other', email: 'A@B.co', password: 'longenough', ageConfirmed: true } });
  assert.equal(dupeEmail.status, 409);
});

test('login, session, logout', async () => {
  const { user } = await newUser();
  const c = client();
  assert.equal((await c('/api/me')).status, 401);
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { identifier: user.username, password: 'wrong-password' } })).status, 401);
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { identifier: 'ghost', password: 'whatever1' } })).status, 401);
  const ok = await c('/api/auth/login', { method: 'POST', body: { identifier: user.email.toUpperCase(), password: 'hunter2hunter2' } });
  assert.equal(ok.status, 200);
  const me = await c('/api/me');
  assert.equal(me.data.user.username, user.username);
  assert.equal(me.data.user.balance, config.signupBonus);
  assert.equal(me.data.user.password_hash, undefined);
  await c('/api/auth/logout', { method: 'POST' });
  assert.equal((await c('/api/me')).status, 401);
});

test('CSRF guards: cross-origin and non-JSON writes are rejected', async () => {
  const { c } = await newUser();
  const cross = await c('/api/games/dice', { method: 'POST', body: { wager: 100, target: 50, direction: 'under' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  const form = await c('/api/games/dice', { method: 'POST', body: {}, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
});

test('dice: balance accounting and verifiable roll', async () => {
  const { c } = await newUser();
  const fair = (await c('/api/fair')).data;
  const r = await c('/api/games/dice', { method: 'POST', body: { wager: 1000, target: 50, direction: 'under' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.multiplier, 1.98);
  assert.equal(r.data.seed.nonce, fair.nonce);
  assert.equal(r.data.balance, config.signupBonus - 1000 + r.data.payout);
  assert.equal(r.data.payout, r.data.win ? 1980 : 0);
  const rotated = (await c('/api/fair/rotate', { method: 'POST' })).data;
  assert.equal(sha256(rotated.previousServerSeed), fair.serverSeedHash);
  const expected = Math.floor(floats(rotated.previousServerSeed, fair.clientSeed, fair.nonce, 1)[0] * 10001) / 100;
  assert.equal(r.data.roll, expected);
  const v = (await c('/api/fair/verify', { method: 'POST', body: { serverSeed: rotated.previousServerSeed, clientSeed: fair.clientSeed, nonce: fair.nonce } })).data;
  assert.equal(v.dice, expected);
});

test('dice: rejects bad input and overdraft', async () => {
  const { c } = await newUser();
  for (const body of [
    { wager: 1000, target: 1, direction: 'under' },
    { wager: 1000, target: 99, direction: 'under' },
    { wager: 1000, target: 50, direction: 'sideways' },
    { wager: 5, target: 50, direction: 'under' },
    { wager: 10.5, target: 50, direction: 'under' },
    { wager: '1000', target: 50, direction: 'under' },
  ]) {
    assert.equal((await c('/api/games/dice', { method: 'POST', body })).status, 400, JSON.stringify(body));
  }
  db.prepare('UPDATE users SET balance = 50 WHERE username = ?').run(`player${userCounter}`);
  const broke = await c('/api/games/dice', { method: 'POST', body: { wager: 100, target: 50, direction: 'under' } });
  assert.equal(broke.status, 400);
  assert.match(broke.data.error, /Insufficient/);
  assert.equal(await balanceOf(c), 50);
});

test('plinko and roulette resolve and pay correctly', async () => {
  const { c } = await newUser();
  const p = await c('/api/games/plinko', { method: 'POST', body: { wager: 1000, rows: 16, risk: 'high' } });
  assert.equal(p.status, 200);
  assert.equal(p.data.path.length, 16);
  assert.equal(p.data.bucket, p.data.path.reduce((a, b) => a + b, 0));
  assert.equal(p.data.payout, Math.floor(1000 * p.data.multiplier));
  assert.equal((await c('/api/games/plinko', { method: 'POST', body: { wager: 1000, rows: 10, risk: 'high' } })).status, 400);
  assert.equal((await c('/api/games/plinko', { method: 'POST', body: { wager: 1000, rows: 8, risk: '__proto__' } })).status, 400);

  const before = await balanceOf(c);
  const bets = [{ type: 'red', amount: 100 }, { type: 'straight', value: 17, amount: 100 }, { type: 'dozen', value: 2, amount: 100 }, { type: 'column', value: 3, amount: 100 }];
  const r = await c('/api/games/roulette', { method: 'POST', body: { bets } });
  assert.equal(r.status, 200);
  const n = r.data.number;
  const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const expected = (red.has(n) ? 200 : 0) + (n === 17 ? 3600 : 0) + (n >= 13 && n <= 24 ? 300 : 0) + (n !== 0 && n % 3 === 0 ? 300 : 0);
  assert.equal(r.data.payout, expected);
  assert.equal(r.data.balance, before - 400 + expected);
  assert.equal((await c('/api/games/roulette', { method: 'POST', body: { bets: [{ type: 'straight', value: 37, amount: 100 }] } })).status, 400);
  assert.equal((await c('/api/games/roulette', { method: 'POST', body: { bets: [{ type: 'constructor', amount: 100 }] } })).status, 400);
  assert.equal((await c('/api/games/roulette', { method: 'POST', body: { bets: [] } })).status, 400);
});

test('mines: full lifecycle, cashout and loss', async () => {
  const { c } = await newUser();
  const fair = (await c('/api/fair')).data;
  const s = await c('/api/games/mines/start', { method: 'POST', body: { wager: 1000, mines: 3 } });
  assert.equal(s.status, 200);
  assert.equal(s.data.balance, config.signupBonus - 1000);
  assert.equal((await c('/api/games/mines/start', { method: 'POST', body: { wager: 1000, mines: 3 } })).status, 400);
  assert.equal((await c('/api/games/mines/cashout', { method: 'POST' })).status, 400);
  assert.equal((await c('/api/fair/rotate', { method: 'POST' })).status, 400);

  const mines = db.prepare("SELECT state FROM active_games WHERE game = 'mines' AND user_id = (SELECT id FROM users WHERE username = ?)").get(`player${userCounter}`);
  const minePositions = JSON.parse(mines.state).mines;
  const safe = [...Array(25).keys()].filter((i) => !minePositions.includes(i));
  const r1 = await c('/api/games/mines/reveal', { method: 'POST', body: { tile: safe[0] } });
  assert.equal(r1.data.active, true);
  assert.equal(r1.data.multiplier, 1.125);
  assert.equal((await c('/api/games/mines/reveal', { method: 'POST', body: { tile: safe[0] } })).status, 400);
  const r2 = await c('/api/games/mines/reveal', { method: 'POST', body: { tile: safe[1] } });
  const out = await c('/api/games/mines/cashout', { method: 'POST' });
  assert.equal(out.data.active, false);
  assert.equal(out.data.payout, Math.floor(1000 * r2.data.multiplier));
  assert.deepEqual(out.data.mines, minePositions);
  assert.equal(out.data.balance, config.signupBonus - 1000 + out.data.payout);

  const rot = (await c('/api/fair/rotate', { method: 'POST' })).data;
  const { placeMines } = require('../src/games/mines');
  assert.deepEqual(placeMines(floats(rot.previousServerSeed, fair.clientSeed, fair.nonce, 24), 3), minePositions);

  await c('/api/games/mines/start', { method: 'POST', body: { wager: 1000, mines: 24 } });
  const st = JSON.parse(db.prepare("SELECT state FROM active_games WHERE game = 'mines' AND user_id = (SELECT id FROM users WHERE username = ?)").get(`player${userCounter}`).state);
  const boom = await c('/api/games/mines/reveal', { method: 'POST', body: { tile: st.mines[0] } });
  assert.equal(boom.data.hitMine, true);
  assert.equal(boom.data.payout, 0);
  assert.equal((await c('/api/games/mines/state')).data.active, false);
});

test('crash: cash out early, bust when late, auto cash-out', async () => {
  const { c } = await newUser();
  const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(`player${userCounter}`).id;
  const setCrash = (crashPoint, startAt) => {
    const row = db.prepare("SELECT state FROM active_games WHERE user_id = ? AND game = 'crash'").get(uid);
    const st = JSON.parse(row.state);
    st.crashPoint = crashPoint;
    if (startAt !== undefined) st.startAt = startAt;
    db.prepare("UPDATE active_games SET state = ? WHERE user_id = ? AND game = 'crash'").run(JSON.stringify(st), uid);
  };
  const { msToReach } = require('../src/games/crash');

  await c('/api/games/crash/start', { method: 'POST', body: { wager: 1000 } });
  setCrash(50);
  assert.equal((await c('/api/games/crash/start', { method: 'POST', body: { wager: 1000 } })).status, 400);
  setCrash(50, Date.now() - msToReach(2));
  const win = await c('/api/games/crash/cashout', { method: 'POST' });
  assert.ok(win.data.cashedOutAt >= 2 && win.data.cashedOutAt < 2.1, JSON.stringify(win.data));
  assert.equal(win.data.payout, Math.floor(1000 * win.data.cashedOutAt));

  await c('/api/games/crash/start', { method: 'POST', body: { wager: 1000 } });
  setCrash(1.5, Date.now() - msToReach(1.6));
  const late = await c('/api/games/crash/cashout', { method: 'POST' });
  assert.equal(late.data.payout, 0);
  assert.equal(late.data.cashedOutAt, null);

  await c('/api/games/crash/start', { method: 'POST', body: { wager: 1000, autoCashout: 1.8 } });
  setCrash(3, Date.now() - msToReach(2.5));
  const auto = (await c('/api/games/crash/state')).data;
  assert.equal(auto.cashedOutAt, 1.8);
  assert.equal(auto.payout, 1800);

  assert.equal((await c('/api/games/crash/start', { method: 'POST', body: { wager: 1000, autoCashout: 1 } })).status, 400);
  assert.equal((await c('/api/games/crash/cashout', { method: 'POST' })).status, 400);
});

test('blackjack: plays hands to completion with consistent accounting', async () => {
  const { c } = await newUser();
  let completed = 0;
  for (let i = 0; i < 40; i++) {
    const before = await balanceOf(c);
    let r = (await c('/api/games/blackjack/start', { method: 'POST', body: { wager: 1000 } })).data;
    let guard = 0;
    while (r.active && guard++ < 30) {
      const total = r.hands[r.activeHand].total;
      const act = r.actions.includes('split') && i % 3 === 0 ? 'split' : r.actions.includes('double') && total === 11 ? 'double' : total < 17 ? 'hit' : 'stand';
      const res = await c('/api/games/blackjack/action', { method: 'POST', body: { action: act } });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      r = res.data;
      if (r.active) assert.equal(r.dealer.cards[1], null, 'hole card must stay hidden');
    }
    assert.equal(r.active, false);
    assert.equal(r.balance, before - r.wager + r.payout);
    for (const hand of r.hands) {
      if (hand.result === 'bust') assert.ok(hand.total > 21);
      if (hand.result === 'blackjack') assert.equal(hand.payout, Math.floor(hand.wager * 2.5));
    }
    completed++;
  }
  assert.equal(completed, 40);
  assert.equal((await c('/api/games/blackjack/action', { method: 'POST', body: { action: 'hit' } })).status, 400);
});

test('stripe deposit: checkout, idempotent fulfilment, webhook signature, limits', async () => {
  const { c, user } = await newUser();
  const before = await balanceOf(c);
  assert.equal((await c('/api/wallet/deposit', { method: 'POST', body: { amount: 100 } })).status, 400);
  assert.equal((await c('/api/wallet/deposit', { method: 'POST', body: { amount: 999999 } })).status, 400);
  const d = await c('/api/wallet/deposit', { method: 'POST', body: { amount: 2500 } });
  assert.equal(d.status, 200);
  assert.match(d.data.url, /^https:\/\/checkout\.stripe\.com/);
  const session = sessions.get(`cs_test_${sessionSeq}`);
  assert.equal(session.params.customer_email, user.email);
  assert.match(session.params.success_url, /\{CHECKOUT_SESSION_ID\}/);

  const unpaid = await c(`/deposit/success?session_id=${session.id}`);
  assert.equal(unpaid.status, 302);
  assert.match(unpaid.headers.get('location'), /deposit=pending/);
  assert.equal(await balanceOf(c), before);

  session.payment_status = 'paid';
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: session } });
  const forged = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' }, body: payload });
  assert.equal(forged.status, 400);
  assert.equal(await balanceOf(c), before);

  const sign = (p) => stripe.webhooks.generateTestHeaderString({ payload: p, secret: WEBHOOK_SECRET });
  const hook = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(payload) }, body: payload });
  assert.equal(hook.status, 200);
  assert.equal((await hook.json()).credited, true);
  assert.equal(await balanceOf(c), before + 2500);

  const replay = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(payload) }, body: payload });
  assert.equal((await replay.json()).credited, false);
  const ret = await c(`/deposit/success?session_id=${session.id}`);
  assert.match(ret.headers.get('location'), /deposit=success/);
  assert.equal(await balanceOf(c), before + 2500);

  const d2 = await c('/api/wallet/deposit', { method: 'POST', body: { amount: 50000 } });
  assert.equal(d2.status, 200);
  const s2 = sessions.get(`cs_test_${sessionSeq}`);
  s2.payment_status = 'paid';
  s2.amount_total = 1;
  const tampered = JSON.stringify({ id: 'evt_2', object: 'event', type: 'checkout.session.completed', data: { object: s2 } });
  const tr = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(tampered) }, body: tampered });
  assert.equal((await tr.json()).reason, 'amount_mismatch');
  assert.equal(await balanceOf(c), before + 2500);

  s2.amount_total = 50000;
  db.prepare("UPDATE deposits SET status = 'pending' WHERE stripe_session_id = ?").run(s2.id);
  await c(`/deposit/success?session_id=${s2.id}`);
  assert.equal(await balanceOf(c), before + 52500);
  const over = await c('/api/wallet/deposit', { method: 'POST', body: { amount: 10000 } });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /Daily deposit limit/);

  const deps = (await c('/api/wallet/deposits')).data.deposits;
  assert.deepEqual(deps.map((x) => x.status), ['completed', 'completed']);
  const txs = (await c('/api/transactions')).data.transactions;
  assert.equal(txs.filter((t) => t.type === 'deposit').length, 2);
});

test('history endpoints and client seed changes', async () => {
  const { c } = await newUser();
  assert.equal((await c('/api/fair/client-seed', { method: 'POST', body: { clientSeed: 'has space' } })).status, 400);
  assert.equal((await c('/api/fair/client-seed', { method: 'POST', body: { clientSeed: 'lucky-seed-67' } })).status, 200);
  await c('/api/games/dice', { method: 'POST', body: { wager: 100, target: 50, direction: 'over' } });
  const bets = (await c('/api/bets?limit=5')).data.bets;
  assert.equal(bets.length, 1);
  assert.equal(bets[0].clientSeed, 'lucky-seed-67');
  assert.equal((await c('/api/me')).data.stats.bets, 1);
});


test('real Stripe paid-session payload credits the matching deposit', async () => {
  const { c } = await newUser();
  const before = await balanceOf(c);
  await c('/api/wallet/deposit', { method: 'POST', body: { amount: 2500 } });
  const ours = sessions.get(`cs_test_${sessionSeq}`);
  const real = require('./fixtures/stripe-paid-session.json');
  const session = { ...real, id: ours.id, metadata: ours.params.metadata };
  const payload = JSON.stringify({ id: 'evt_real', object: 'event', type: 'checkout.session.completed', data: { object: session } });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body: payload });
  assert.equal((await res.json()).credited, true);
  assert.equal(await balanceOf(c), before + 2500);
});

test('crates: catalog, open multiple, payout matches items', async () => {
  const { c } = await newUser();
  const { crates } = (await c('/api/crates')).data;
  assert.deepEqual(crates.map((x) => x.id), ['bronze', 'silver', 'gold', 'diamond', 'vault']);
  for (const cr of crates) {
    assert.ok(cr.rtp >= 94.9 && cr.rtp <= 97.1, `${cr.id} rtp ${cr.rtp}`);
    assert.ok(Math.abs(cr.items.reduce((s, i) => s + i.chance, 0) - 100) < 0.01);
  }
  const before = await balanceOf(c);
  const r = await c('/api/games/crates/open', { method: 'POST', body: { crate: 'silver', quantity: 3 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.items.length, 3);
  assert.equal(r.data.wager, 1500);
  assert.equal(r.data.payout, r.data.items.reduce((s, i) => s + i.value, 0));
  assert.equal(r.data.balance, before - 1500 + r.data.payout);
  for (const body of [{ crate: 'nope' }, { crate: 'bronze', quantity: 6 }, { crate: 'bronze', quantity: 0 }, { crate: '__proto__' }]) {
    assert.equal((await c('/api/games/crates/open', { method: 'POST', body })).status, 400, JSON.stringify(body));
  }
  db.prepare('UPDATE users SET balance = 50 WHERE username = ?').run(`player${userCounter}`);
  assert.equal((await c('/api/games/crates/open', { method: 'POST', body: { crate: 'bronze' } })).status, 400);
});

test('withdrawals: eligibility, request, cancel, admin pay and reject', async () => {
  const { c } = await newUser();
  const uname = `player${userCounter}`;
  const body = { amount: 2000, method: 'paypal', details: 'me@example.com', discord: '@Some.Player' };
  const noDep = await c('/api/wallet/withdraw', { method: 'POST', body });
  assert.equal(noDep.status, 400);
  assert.match(noDep.data.error, /deposit/i);

  await c('/api/wallet/deposit', { method: 'POST', body: { amount: 5000 } });
  const s = sessions.get(`cs_test_${sessionSeq}`);
  s.payment_status = 'paid';
  await c(`/deposit/success?session_id=${s.id}`);
  const playthrough = await c('/api/wallet/withdraw', { method: 'POST', body });
  assert.match(playthrough.data.error, /Wager \$50\.00 more/);

  await c('/api/games/crates/open', { method: 'POST', body: { crate: 'gold', quantity: 2 } });
  const bal = await balanceOf(c);
  assert.equal((await c('/api/wallet/withdraw', { method: 'POST', body: { ...body, amount: 500 } })).status, 400);
  assert.equal((await c('/api/wallet/withdraw', { method: 'POST', body: { ...body, discord: 'x' } })).status, 400);
  assert.equal((await c('/api/wallet/withdraw', { method: 'POST', body: { ...body, method: 'venmo2' } })).status, 400);
  assert.equal((await c('/api/wallet/withdraw', { method: 'POST', body: { ...body, amount: bal + 100 } })).status, 400);

  const ok = await c('/api/wallet/withdraw', { method: 'POST', body });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.contact, 'wmz9');
  assert.equal(ok.data.withdrawal.discord, 'some.player');
  assert.equal(ok.data.balance, bal - 2000);
  assert.equal((await c('/api/wallet/withdraw', { method: 'POST', body })).data.error, 'You already have a pending withdrawal');

  const cancel = await c(`/api/wallet/withdrawals/${ok.data.withdrawal.id}/cancel`, { method: 'POST' });
  assert.equal(cancel.data.balance, bal);
  assert.equal((await c(`/api/wallet/withdrawals/${ok.data.withdrawal.id}/cancel`, { method: 'POST' })).status, 400);

  assert.equal((await c('/api/admin/withdrawals')).status, 403);
  const admin = client();
  await admin('/api/auth/signup', { method: 'POST', body: { username: 'boss', email: 'boss@example.com', password: 'bossbossboss', ageConfirmed: true } });
  assert.equal((await admin('/api/me')).data.user.isAdmin, true);

  const w1 = (await c('/api/wallet/withdraw', { method: 'POST', body })).data.withdrawal;
  const pending = (await admin('/api/admin/withdrawals?status=pending')).data.withdrawals;
  assert.ok(pending.some((w) => w.id === w1.id && w.username === uname));
  const paid = await admin(`/api/admin/withdrawals/${w1.id}/pay`, { method: 'POST', body: { note: 'PayPal txn 123' } });
  assert.equal(paid.data.withdrawal.status, 'paid');
  assert.equal(await balanceOf(c), bal - 2000);
  assert.equal((await admin(`/api/admin/withdrawals/${w1.id}/reject`, { method: 'POST', body: {} })).status, 400);

  const w2 = (await c('/api/wallet/withdraw', { method: 'POST', body: { ...body, amount: 1000 } })).data.withdrawal;
  await admin(`/api/admin/withdrawals/${w2.id}/reject`, { method: 'POST', body: { note: 'Wrong details' } });
  assert.equal(await balanceOf(c), bal - 2000);
  const mine = (await c('/api/wallet/withdrawals')).data.withdrawals;
  assert.deepEqual(mine.map((w) => w.status), ['rejected', 'paid', 'cancelled']);
  assert.equal(mine[0].adminNote, 'Wrong details');
  const types = (await c('/api/transactions')).data.transactions.map((t) => t.type);
  assert.equal(types.filter((t) => t === 'withdrawal').length, 3);
  assert.equal(types.filter((t) => t === 'withdrawal_refund').length, 2);
  const o = (await admin('/api/admin/overview')).data;
  assert.equal(o.withdrawalsPaid.total >= 2000, true);
});

test('live feed masks usernames', async () => {
  const { c } = await newUser();
  db.prepare("INSERT INTO bets (user_id, game, wager, payout, multiplier, detail, server_seed_hash, client_seed, nonce, created_at) VALUES ((SELECT id FROM users WHERE username = ?), 'dice', 100, 1000, 10, '{}', 'h', 'c', 0, ?)").run(`player${userCounter}`, Date.now());
  const { wins } = (await c('/api/feed')).data;
  assert.equal(wins[0].multiplier, 10);
  assert.ok(!wins.some((w) => w.player.startsWith('player') && !w.player.includes('*')));
  assert.match(wins[0].player, /^pl\*+$/);
});
