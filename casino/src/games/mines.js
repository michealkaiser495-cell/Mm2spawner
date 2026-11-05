const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, getActive, saveActive, clearActive, publicSeed } = require('./common');

const GAME = 'mines';
const TILES = 25;

function multiplierFor(mines, safeRevealed) {
  let m = 0.99;
  for (let i = 0; i < safeRevealed; i++) m *= (TILES - i) / (TILES - mines - i);
  return Math.floor(m * 10000) / 10000;
}

function placeMines(fl, count) {
  const tiles = Array.from({ length: TILES }, (_, i) => i);
  for (let i = TILES - 1; i > 0; i--) {
    const j = Math.floor(fl[TILES - 1 - i] * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, count).sort((a, b) => a - b);
}

function view(state) {
  const k = state.revealed.length;
  return {
    active: true,
    wager: state.wager,
    mineCount: state.mineCount,
    revealed: state.revealed,
    multiplier: k ? multiplierFor(state.mineCount, k) : 1,
    nextMultiplier: multiplierFor(state.mineCount, k + 1),
    seed: publicSeed(state.seed),
  };
}

function settle(db, userId, state, won) {
  const multiplier = won ? multiplierFor(state.mineCount, state.revealed.length) : 0;
  const payout = Math.floor(state.wager * multiplier);
  const detail = { mineCount: state.mineCount, mines: state.mines, revealed: state.revealed, hitMine: !won };
  const betId = recordBet(db, userId, GAME, state.wager, payout, detail, state.seed);
  clearActive(db, userId, GAME);
  const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', GAME, String(betId)) : balanceOf(db, userId);
  return { active: false, ...detail, wager: state.wager, multiplier, payout, balance, betId, seed: publicSeed(state.seed) };
}

function start(db, userId, body) {
  const wager = wagerOf(body.wager);
  const mineCount = Number(body.mines);
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) throw bad('Mines must be between 1 and 24');
  return tx(db, () => {
    if (getActive(db, userId, GAME)) throw bad('Finish your current mines game first');
    adjustBalance(db, userId, -wager, 'bet', GAME);
    const seed = nextSeed(db, userId);
    const mines = placeMines(floats(seed.serverSeed, seed.clientSeed, seed.nonce, TILES - 1), mineCount);
    const state = { wager, mineCount, mines, revealed: [], seed };
    saveActive(db, userId, GAME, state);
    return { ...view(state), balance: balanceOf(db, userId) };
  });
}

function reveal(db, userId, body) {
  const tile = Number(body.tile);
  if (!Number.isInteger(tile) || tile < 0 || tile >= TILES) throw bad('Tile must be 0-24');
  return tx(db, () => {
    const state = getActive(db, userId, GAME);
    if (!state) throw bad('No mines game in progress');
    if (state.revealed.includes(tile)) throw bad('Tile already revealed');
    if (state.mines.includes(tile)) {
      state.revealed.push(tile);
      return settle(db, userId, state, false);
    }
    state.revealed.push(tile);
    if (state.revealed.length === TILES - state.mineCount) return settle(db, userId, state, true);
    saveActive(db, userId, GAME, state);
    return view(state);
  });
}

function cashout(db, userId) {
  return tx(db, () => {
    const state = getActive(db, userId, GAME);
    if (!state) throw bad('No mines game in progress');
    if (state.revealed.length === 0) throw bad('Reveal at least one tile before cashing out');
    return settle(db, userId, state, true);
  });
}

function status(db, userId) {
  const state = getActive(db, userId, GAME);
  return state ? view(state) : { active: false };
}

module.exports = { start, reveal, cashout, status, multiplierFor, placeMines };
