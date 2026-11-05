const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { AppError, bad } = require('./errors');
const { makeAuth, publicUser } = require('./auth');
const { makePayments } = require('./payments');
const { newServerSeed, sha256 } = require('./fair');
const { verify } = require('./verify');
const { MIN_BET, MAX_BET } = require('./games/common');
const dice = require('./games/dice');
const plinko = require('./games/plinko');
const roulette = require('./games/roulette');
const crash = require('./games/crash');
const mines = require('./games/mines');
const blackjack = require('./games/blackjack');

function limiter(config, windowMs, limit) {
  if (!config.rateLimit) return (_req, _res, next) => next();
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });
}

function createApp({ db, config, stripe = null }) {
  const app = express();
  const auth = makeAuth(db, config);
  const payments = makePayments(db, config, stripe);

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com",
    });
    next();
  });

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await payments.handleWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true, ...result });
  });

  app.use('/api', limiter(config, 60_000, 900));
  app.use('/api', (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (origin) {
      let host;
      try {
        host = new URL(origin).host;
      } catch {
        return next(new AppError(403, 'Bad origin'));
      }
      if (host !== req.headers.host) return next(new AppError(403, 'Cross-site request blocked'));
    }
    if (!req.is('application/json')) return next(new AppError(415, 'Requests must be JSON'));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(auth.loadUser);

  const authLimiter = limiter(config, 15 * 60_000, 30);
  app.post('/api/auth/signup', authLimiter, auth.signup);
  app.post('/api/auth/login', authLimiter, auth.login);
  app.post('/api/auth/logout', auth.logout);

  app.get('/api/config', (_req, res) => {
    res.json({
      siteName: config.siteName,
      depositsEnabled: payments.enabled(),
      minBet: MIN_BET,
      maxBet: MAX_BET,
      minDeposit: config.minDeposit,
      maxDeposit: config.maxDeposit,
      dailyDepositLimit: config.dailyDepositLimit,
      signupBonus: config.signupBonus,
      currency: config.currency,
    });
  });

  const user = express.Router();
  user.use(auth.requireUser);

  user.get('/me', (req, res) => {
    const stats = db.prepare(
      'SELECT COUNT(*) AS bets, COALESCE(SUM(wager), 0) AS wagered, COALESCE(SUM(payout), 0) AS paidOut FROM bets WHERE user_id = ?'
    ).get(req.user.id);
    res.json({ user: publicUser(req.user), stats });
  });

  user.get('/bets', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const game = typeof req.query.game === 'string' ? req.query.game : null;
    const rows = game
      ? db.prepare('SELECT * FROM bets WHERE user_id = ? AND game = ? ORDER BY id DESC LIMIT ?').all(req.user.id, game, limit)
      : db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(req.user.id, limit);
    res.json({
      bets: rows.map((b) => ({
        id: b.id, game: b.game, wager: b.wager, payout: b.payout, multiplier: b.multiplier,
        detail: JSON.parse(b.detail), serverSeedHash: b.server_seed_hash, clientSeed: b.client_seed, nonce: b.nonce, createdAt: b.created_at,
      })),
    });
  });

  user.get('/transactions', (req, res) => {
    const rows = db.prepare(
      'SELECT id, type, amount, balance_after AS balanceAfter, game, created_at AS createdAt FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50'
    ).all(req.user.id);
    res.json({ transactions: rows });
  });

  user.get('/wallet/deposits', (req, res) => {
    const rows = db.prepare(
      'SELECT id, amount, status, created_at AS createdAt, completed_at AS completedAt FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 25'
    ).all(req.user.id);
    res.json({ deposits: rows });
  });

  user.post('/wallet/deposit', limiter(config, 60_000, 10), async (req, res) => {
    res.json(await payments.createDeposit(req.user, req.body?.amount));
  });

  user.get('/fair', (req, res) => {
    const u = req.user;
    res.json({
      serverSeedHash: sha256(u.server_seed),
      clientSeed: u.client_seed,
      nonce: u.nonce,
      previousServerSeed: u.prev_server_seed,
      previousServerSeedHash: u.prev_server_seed ? sha256(u.prev_server_seed) : null,
    });
  });

  user.post('/fair/client-seed', (req, res) => {
    const seed = req.body?.clientSeed;
    if (typeof seed !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(seed)) throw bad('Client seed must be 1-64 printable characters without spaces');
    db.prepare('UPDATE users SET client_seed = ? WHERE id = ?').run(seed, req.user.id);
    res.json({ clientSeed: seed });
  });

  user.post('/fair/rotate', (req, res) => {
    const active = db.prepare('SELECT game FROM active_games WHERE user_id = ?').all(req.user.id);
    if (active.length) throw bad(`Finish your active ${active.map((a) => a.game).join(', ')} game first`);
    const next = newServerSeed();
    db.prepare('UPDATE users SET prev_server_seed = server_seed, server_seed = ?, nonce = 0 WHERE id = ?').run(next, req.user.id);
    res.json({ previousServerSeed: req.user.server_seed, serverSeedHash: sha256(next), nonce: 0 });
  });

  user.post('/fair/verify', (req, res) => res.json(verify(req.body || {})));

  const gameLimiter = limiter(config, 1000, 25);
  const play = (fn) => (req, res) => res.json(fn(db, req.user.id, req.body || {}));
  user.post('/games/dice', gameLimiter, play(dice.play));
  user.post('/games/plinko', gameLimiter, play(plinko.play));
  user.post('/games/roulette', gameLimiter, play(roulette.play));
  user.post('/games/crash/start', gameLimiter, play(crash.start));
  user.post('/games/crash/cashout', gameLimiter, play(crash.cashout));
  user.get('/games/crash/state', play(crash.status));
  user.post('/games/mines/start', gameLimiter, play(mines.start));
  user.post('/games/mines/reveal', gameLimiter, play(mines.reveal));
  user.post('/games/mines/cashout', gameLimiter, play(mines.cashout));
  user.get('/games/mines/state', play(mines.status));
  user.post('/games/blackjack/start', gameLimiter, play(blackjack.start));
  user.post('/games/blackjack/action', gameLimiter, play(blackjack.action));
  user.get('/games/blackjack/state', play(blackjack.status));

  app.use('/api', user);
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Not found')));

  app.get('/deposit/success', async (req, res) => {
    try {
      const r = await payments.confirmReturn(req.query.session_id);
      res.redirect(`/#/wallet?deposit=${r.credited || r.reason === 'already_credited' ? 'success' : 'pending'}`);
    } catch (err) {
      console.error('deposit confirmation failed:', err.message);
      res.redirect('/#/wallet?deposit=error');
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp };
