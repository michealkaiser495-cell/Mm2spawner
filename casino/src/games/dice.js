const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, publicSeed } = require('./common');

const EDGE_FACTOR = 99;

function multiplierFor(target, direction) {
  const chance = direction === 'under' ? target : 100 - target;
  return Math.floor((EDGE_FACTOR / chance) * 10000) / 10000;
}

function play(db, userId, body) {
  const wager = wagerOf(body.wager);
  const target = Number(body.target);
  const direction = body.direction;
  if (direction !== 'under' && direction !== 'over') throw bad('Direction must be "under" or "over"');
  if (!Number.isFinite(target) || target < 2 || target > 98 || Math.round(target * 100) !== target * 100) {
    throw bad('Target must be between 2.00 and 98.00');
  }
  return tx(db, () => {
    adjustBalance(db, userId, -wager, 'bet', 'dice');
    const seed = nextSeed(db, userId);
    const roll = Math.floor(floats(seed.serverSeed, seed.clientSeed, seed.nonce, 1)[0] * 10001) / 100;
    const multiplier = multiplierFor(target, direction);
    const win = direction === 'under' ? roll < target : roll > target;
    const payout = win ? Math.floor(wager * multiplier) : 0;
    const detail = { roll, target, direction, multiplier, win };
    const betId = recordBet(db, userId, 'dice', wager, payout, detail, seed);
    const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', 'dice', String(betId)) : balanceOf(db, userId);
    return { ...detail, wager, payout, balance, betId, seed: publicSeed(seed) };
  });
}

module.exports = { play, multiplierFor };
