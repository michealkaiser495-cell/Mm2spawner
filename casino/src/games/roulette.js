const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, MAX_BET, publicSeed } = require('./common');

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const BET_TYPES = {
  straight: { pays: 36, wins: (n, v) => n === v },
  red: { pays: 2, wins: (n) => RED.has(n) },
  black: { pays: 2, wins: (n) => n !== 0 && !RED.has(n) },
  odd: { pays: 2, wins: (n) => n !== 0 && n % 2 === 1 },
  even: { pays: 2, wins: (n) => n !== 0 && n % 2 === 0 },
  low: { pays: 2, wins: (n) => n >= 1 && n <= 18 },
  high: { pays: 2, wins: (n) => n >= 19 },
  dozen: { pays: 3, wins: (n, v) => n !== 0 && Math.ceil(n / 12) === v },
  column: { pays: 3, wins: (n, v) => n !== 0 && ((n - 1) % 3) + 1 === v },
};

function normalizeBets(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw bad('Place at least one bet');
  if (raw.length > 60) throw bad('Too many bets on one spin');
  return raw.map((b) => {
    if (!b || !Object.hasOwn(BET_TYPES, b.type)) throw bad(`Unknown bet type "${b?.type}"`);
    const amount = wagerOf(b.amount);
    let value = null;
    if (b.type === 'straight') {
      value = Number(b.value);
      if (!Number.isInteger(value) || value < 0 || value > 36) throw bad('Straight bets need a number 0-36');
    } else if (b.type === 'dozen' || b.type === 'column') {
      value = Number(b.value);
      if (![1, 2, 3].includes(value)) throw bad(`${b.type} bets need a value of 1, 2 or 3`);
    }
    return { type: b.type, value, amount };
  });
}

function play(db, userId, body) {
  const bets = normalizeBets(body.bets);
  const wager = bets.reduce((s, b) => s + b.amount, 0);
  if (wager > MAX_BET) throw bad(`Total stake exceeds $${(MAX_BET / 100).toFixed(2)}`);
  return tx(db, () => {
    adjustBalance(db, userId, -wager, 'bet', 'roulette');
    const seed = nextSeed(db, userId);
    const number = Math.floor(floats(seed.serverSeed, seed.clientSeed, seed.nonce, 1)[0] * 37);
    const results = bets.map((b) => {
      const def = BET_TYPES[b.type];
      const win = def.wins(number, b.value);
      return { ...b, win, payout: win ? b.amount * def.pays : 0 };
    });
    const payout = results.reduce((s, r) => s + r.payout, 0);
    const color = number === 0 ? 'green' : RED.has(number) ? 'red' : 'black';
    const detail = { number, color, bets: results };
    const betId = recordBet(db, userId, 'roulette', wager, payout, detail, seed);
    const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', 'roulette', String(betId)) : balanceOf(db, userId);
    return { ...detail, wager, payout, balance, betId, seed: publicSeed(seed) };
  });
}

module.exports = { play, RED, BET_TYPES };
