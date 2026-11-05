const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, getActive, saveActive, clearActive, publicSeed } = require('./common');

const GAME = 'crash';
const GROWTH = 0.00006;
const MAX_CRASH = 1_000_000;

const multiplierAt = (ms) => Math.floor(100 * Math.exp(GROWTH * Math.max(0, ms))) / 100;
const msToReach = (m) => Math.log(m) / GROWTH;

function crashPointFrom(f) {
  return Math.min(MAX_CRASH, Math.max(1, Math.floor(99 / (1 - f)) / 100));
}

function settle(db, userId, state, cashedOutAt) {
  const payout = cashedOutAt ? Math.floor(state.wager * cashedOutAt) : 0;
  const detail = { crashPoint: state.crashPoint, cashedOutAt: cashedOutAt || null, autoCashout: state.autoCashout };
  const betId = recordBet(db, userId, GAME, state.wager, payout, detail, state.seed);
  clearActive(db, userId, GAME);
  const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', GAME, String(betId)) : balanceOf(db, userId);
  return { active: false, ...detail, wager: state.wager, payout, balance, betId, seed: publicSeed(state.seed) };
}

function resolveIfDue(db, userId, now) {
  const state = getActive(db, userId, GAME);
  if (!state) return { state: null, result: null };
  const elapsed = now - state.startAt;
  const { autoCashout, crashPoint } = state;
  if (autoCashout && autoCashout <= crashPoint && elapsed >= msToReach(autoCashout)) {
    return { state: null, result: settle(db, userId, state, autoCashout) };
  }
  if (elapsed >= msToReach(crashPoint)) {
    return { state: null, result: settle(db, userId, state, 0) };
  }
  return { state, result: null };
}

function activeView(state, now) {
  return {
    active: true,
    wager: state.wager,
    autoCashout: state.autoCashout,
    elapsed: now - state.startAt,
    multiplier: multiplierAt(now - state.startAt),
    seed: publicSeed(state.seed),
  };
}

function start(db, userId, body) {
  const wager = wagerOf(body.wager);
  let autoCashout = null;
  if (body.autoCashout !== undefined && body.autoCashout !== null && body.autoCashout !== '') {
    autoCashout = Math.floor(Number(body.autoCashout) * 100) / 100;
    if (!Number.isFinite(autoCashout) || autoCashout < 1.01 || autoCashout > MAX_CRASH) {
      throw bad('Auto cash-out must be between 1.01x and 1,000,000x');
    }
  }
  return tx(db, () => {
    const now = Date.now();
    if (resolveIfDue(db, userId, now).state) throw bad('You already have a crash round in progress');
    adjustBalance(db, userId, -wager, 'bet', GAME);
    const seed = nextSeed(db, userId);
    const crashPoint = crashPointFrom(floats(seed.serverSeed, seed.clientSeed, seed.nonce, 1)[0]);
    const state = { wager, autoCashout, crashPoint, startAt: now, seed };
    saveActive(db, userId, GAME, state);
    return { ...activeView(state, now), balance: balanceOf(db, userId) };
  });
}

function status(db, userId) {
  return tx(db, () => {
    const now = Date.now();
    const { state, result } = resolveIfDue(db, userId, now);
    if (result) return result;
    if (!state) return { active: false };
    return activeView(state, now);
  });
}

function cashout(db, userId) {
  return tx(db, () => {
    const now = Date.now();
    const { state, result } = resolveIfDue(db, userId, now);
    if (result) return result;
    if (!state) throw bad('No crash round in progress');
    const m = multiplierAt(now - state.startAt);
    return settle(db, userId, state, m < state.crashPoint ? m : 0);
  });
}

module.exports = { start, status, cashout, crashPointFrom, multiplierAt, msToReach };
