const { bad } = require('../errors');

const MIN_BET = 10;
const MAX_BET = 100000;

function wagerOf(value) {
  if (!Number.isInteger(value)) throw bad('Bet must be a whole number of cents');
  if (value < MIN_BET) throw bad(`Minimum bet is $${(MIN_BET / 100).toFixed(2)}`);
  if (value > MAX_BET) throw bad(`Maximum bet is $${(MAX_BET / 100).toFixed(2)}`);
  return value;
}

function getActive(db, userId, game) {
  const row = db.prepare('SELECT state FROM active_games WHERE user_id = ? AND game = ?').get(userId, game);
  return row ? JSON.parse(row.state) : null;
}

function saveActive(db, userId, game, state) {
  db.prepare(
    `INSERT INTO active_games (user_id, game, state, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, game) DO UPDATE SET state = excluded.state`
  ).run(userId, game, JSON.stringify(state), Date.now());
}

function clearActive(db, userId, game) {
  db.prepare('DELETE FROM active_games WHERE user_id = ? AND game = ?').run(userId, game);
}

const publicSeed = (s) => ({ serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce });

module.exports = { MIN_BET, MAX_BET, wagerOf, getActive, saveActive, clearActive, publicSeed };
