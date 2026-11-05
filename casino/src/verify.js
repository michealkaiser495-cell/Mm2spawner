const { bad } = require('./errors');
const { floats, sha256 } = require('./fair');
const { crashPointFrom } = require('./games/crash');
const { placeMines } = require('./games/mines');

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

function verify({ serverSeed, clientSeed, nonce, mines }) {
  if (typeof serverSeed !== 'string' || !/^[0-9a-f]{64}$/.test(serverSeed)) throw bad('Server seed must be 64 hex characters');
  if (typeof clientSeed !== 'string' || clientSeed.length < 1 || clientSeed.length > 64) throw bad('Client seed must be 1-64 characters');
  const n = Number(nonce);
  if (!Number.isInteger(n) || n < 0) throw bad('Nonce must be a non-negative integer');
  const mineCount = mines === undefined ? 3 : Number(mines);
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) throw bad('Mines must be between 1 and 24');

  const f = floats(serverSeed, clientSeed, n, 24);
  return {
    serverSeedHash: sha256(serverSeed),
    dice: Math.floor(f[0] * 10001) / 100,
    crash: crashPointFrom(f[0]),
    roulette: Math.floor(f[0] * 37),
    plinkoPath: f.slice(0, 16).map((x) => (x < 0.5 ? 'L' : 'R')),
    mines: placeMines(f, mineCount),
    blackjackCards: f.slice(0, 8).map((x) => {
      const c = Math.floor(x * 52);
      return RANKS[c % 13] + SUITS[Math.floor(c / 13)];
    }),
  };
}

module.exports = { verify };
