const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, publicSeed } = require('./common');

const TABLES = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
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

function play(db, userId, body) {
  const wager = wagerOf(body.wager);
  const rows = Number(body.rows);
  const risk = body.risk;
  if (!Object.hasOwn(TABLES, rows)) throw bad('Rows must be 8, 12 or 16');
  if (!Object.hasOwn(TABLES[rows], risk)) throw bad('Risk must be low, medium or high');
  return tx(db, () => {
    adjustBalance(db, userId, -wager, 'bet', 'plinko');
    const seed = nextSeed(db, userId);
    const path = floats(seed.serverSeed, seed.clientSeed, seed.nonce, rows).map((f) => (f < 0.5 ? 0 : 1));
    const bucket = path.reduce((a, b) => a + b, 0);
    const multiplier = TABLES[rows][risk][bucket];
    const payout = Math.floor(wager * multiplier);
    const detail = { rows, risk, path, bucket, multiplier };
    const betId = recordBet(db, userId, 'plinko', wager, payout, detail, seed);
    const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', 'plinko', String(betId)) : balanceOf(db, userId);
    return { ...detail, wager, payout, balance, betId, seed: publicSeed(seed) };
  });
}

module.exports = { play, TABLES };
