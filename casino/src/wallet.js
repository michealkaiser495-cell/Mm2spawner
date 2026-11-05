const { bad } = require('./errors');

function balanceOf(db, userId) {
  return db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
}

function adjustBalance(db, userId, delta, type, game = null, ref = null) {
  const next = balanceOf(db, userId) + delta;
  if (next < 0) throw bad('Insufficient balance');
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(next, userId);
  db.prepare(
    'INSERT INTO transactions (user_id, type, amount, balance_after, game, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, type, delta, next, game, ref, Date.now());
  return next;
}

function recordBet(db, userId, game, wager, payout, detail, seed) {
  const multiplier = wager > 0 ? Math.round((payout / wager) * 10000) / 10000 : 0;
  const r = db.prepare(
    `INSERT INTO bets (user_id, game, wager, payout, multiplier, detail, server_seed_hash, client_seed, nonce, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, game, wager, payout, multiplier, JSON.stringify(detail), seed.serverSeedHash, seed.clientSeed, seed.nonce, Date.now());
  return Number(r.lastInsertRowid);
}

module.exports = { adjustBalance, recordBet, balanceOf };
