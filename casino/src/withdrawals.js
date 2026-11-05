const { tx } = require('./db');
const { AppError, bad } = require('./errors');
const { adjustBalance } = require('./wallet');

const METHODS = ['paypal', 'cashapp', 'crypto', 'other'];
const DISCORD_RE = /^[a-z0-9_.]{2,32}$/;

const view = (w) => ({
  id: w.id,
  amount: w.amount,
  method: w.method,
  details: w.details,
  discord: w.discord,
  status: w.status,
  adminNote: w.admin_note,
  createdAt: w.created_at,
  resolvedAt: w.resolved_at,
});

function makeWithdrawals(db, config) {
  function eligibility(userId) {
    const dep = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deposits WHERE user_id = ? AND status = 'completed'").get(userId);
    const wagered = db.prepare('SELECT COALESCE(SUM(wager), 0) AS total FROM bets WHERE user_id = ?').get(userId).total;
    const pending = db.prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status = 'pending'").get(userId).n;
    const wagerRequired = Math.max(0, dep.total - wagered);
    return { hasDeposit: dep.n > 0, deposited: dep.total, wagered, wagerRequired, pending: pending > 0 };
  }

  function request(user, body) {
    const amount = body.amount;
    const method = body.method;
    const details = typeof body.details === 'string' ? body.details.trim() : '';
    const discord = typeof body.discord === 'string' ? body.discord.trim().toLowerCase().replace(/^@/, '') : '';
    if (!Number.isInteger(amount)) throw bad('Amount must be a whole number of cents');
    if (amount < config.minWithdraw) throw bad(`Minimum withdrawal is $${(config.minWithdraw / 100).toFixed(2)}`);
    if (!METHODS.includes(method)) throw bad('Choose a payout method');
    if (details.length < 3 || details.length > 200) throw bad('Enter your payout details (3-200 characters)');
    if (!DISCORD_RE.test(discord)) throw bad('Enter your Discord username so staff can contact you');
    return tx(db, () => {
      const e = eligibility(user.id);
      if (e.pending) throw bad('You already have a pending withdrawal');
      if (!e.hasDeposit) throw bad('Make at least one deposit before withdrawing. Bonus credit cannot be withdrawn.');
      if (e.wagerRequired > 0) throw bad(`Wager $${(e.wagerRequired / 100).toFixed(2)} more before withdrawing (deposits must be played through once)`);
      const r = db.prepare(
        'INSERT INTO withdrawals (user_id, amount, method, details, discord, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user.id, amount, method, details, discord, Date.now());
      const id = Number(r.lastInsertRowid);
      const balance = adjustBalance(db, user.id, -amount, 'withdrawal', null, `W${id}`);
      return { withdrawal: view(db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id)), balance, contact: config.discordContact };
    });
  }

  function list(userId) {
    return db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 25').all(userId).map(view);
  }

  function cancel(userId, id) {
    return tx(db, () => {
      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ? AND user_id = ?').get(id, userId);
      if (!w) throw new AppError(404, 'Withdrawal not found');
      if (w.status !== 'pending') throw bad('Only pending withdrawals can be cancelled');
      db.prepare("UPDATE withdrawals SET status = 'cancelled', resolved_at = ? WHERE id = ?").run(Date.now(), id);
      const balance = adjustBalance(db, userId, w.amount, 'withdrawal_refund', null, `W${id}`);
      return { withdrawal: view({ ...w, status: 'cancelled', resolved_at: Date.now() }), balance };
    });
  }

  function adminList(status) {
    const rows = status
      ? db.prepare('SELECT w.*, u.username, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status = ? ORDER BY w.id DESC LIMIT 200').all(status)
      : db.prepare('SELECT w.*, u.username, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 200').all();
    return rows.map((w) => ({ ...view(w), username: w.username, email: w.email, eligibility: eligibility(w.user_id) }));
  }

  function resolve(adminId, id, action, note) {
    if (action !== 'paid' && action !== 'rejected') throw bad('Action must be paid or rejected');
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';
    return tx(db, () => {
      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      if (!w) throw new AppError(404, 'Withdrawal not found');
      if (w.status !== 'pending') throw bad(`Withdrawal is already ${w.status}`);
      db.prepare('UPDATE withdrawals SET status = ?, admin_note = ?, resolved_at = ?, resolved_by = ? WHERE id = ?')
        .run(action, cleanNote || null, Date.now(), adminId, id);
      if (action === 'rejected') adjustBalance(db, w.user_id, w.amount, 'withdrawal_refund', null, `W${id}`);
      return view(db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id));
    });
  }

  function overview() {
    const one = (sql) => db.prepare(sql).get();
    return {
      users: one('SELECT COUNT(*) AS n FROM users').n,
      deposits: one("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deposits WHERE status = 'completed'"),
      withdrawalsPaid: one("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE status = 'paid'"),
      withdrawalsPending: one("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE status = 'pending'"),
      bets: one('SELECT COUNT(*) AS n, COALESCE(SUM(wager), 0) AS wagered, COALESCE(SUM(payout), 0) AS paidOut FROM bets'),
      liabilities: one('SELECT COALESCE(SUM(balance), 0) AS total FROM users').total,
    };
  }

  return { request, list, cancel, eligibility, adminList, resolve, overview };
}

module.exports = { makeWithdrawals, METHODS };
