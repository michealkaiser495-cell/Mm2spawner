const { tx } = require('./db');
const { AppError, bad } = require('./errors');
const { adjustBalance } = require('./wallet');

const DAY_MS = 24 * 60 * 60 * 1000;

function makePayments(db, config, stripe) {
  const enabled = () => Boolean(stripe);

  function requireStripe() {
    if (!stripe) throw new AppError(503, 'Deposits are not configured. Set STRIPE_SECRET_KEY on the server.');
  }

  async function createDeposit(user, amount) {
    requireStripe();
    if (!Number.isInteger(amount)) throw bad('Amount must be a whole number of cents');
    if (amount < config.minDeposit || amount > config.maxDeposit) {
      throw bad(`Deposits must be between $${(config.minDeposit / 100).toFixed(2)} and $${(config.maxDeposit / 100).toFixed(2)}`);
    }
    const recent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM deposits WHERE user_id = ? AND status = 'completed' AND completed_at > ?"
    ).get(user.id, Date.now() - DAY_MS).total;
    if (recent + amount > config.dailyDepositLimit) {
      const left = Math.max(0, config.dailyDepositLimit - recent);
      throw bad(`Daily deposit limit reached. You can deposit $${(left / 100).toFixed(2)} more in the next 24 hours.`);
    }
    const depositId = Number(
      db.prepare('INSERT INTO deposits (user_id, amount, created_at) VALUES (?, ?, ?)').run(user.id, amount, Date.now()).lastInsertRowid
    );
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        client_reference_id: String(user.id),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: config.currency,
              unit_amount: amount,
              product_data: { name: `${config.siteName} balance top-up`, description: `$${(amount / 100).toFixed(2)} in play credit` },
            },
          },
        ],
        metadata: { deposit_id: String(depositId), user_id: String(user.id) },
        payment_intent_data: { metadata: { deposit_id: String(depositId), user_id: String(user.id) } },
        success_url: `${config.baseUrl}/deposit/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.baseUrl}/#/wallet?deposit=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      });
    } catch (err) {
      db.prepare("UPDATE deposits SET status = 'failed' WHERE id = ?").run(depositId);
      throw new AppError(502, `Stripe error: ${err.message}`);
    }
    db.prepare('UPDATE deposits SET stripe_session_id = ? WHERE id = ?').run(session.id, depositId);
    return { url: session.url, depositId };
  }

  function fulfill(session) {
    if (!session || session.payment_status !== 'paid') return { credited: false, reason: 'not_paid' };
    const depositId = Number(session.metadata?.deposit_id);
    return tx(db, () => {
      const dep = db.prepare('SELECT * FROM deposits WHERE id = ? AND stripe_session_id = ?').get(depositId, session.id);
      if (!dep) return { credited: false, reason: 'unknown_deposit' };
      if (dep.status === 'completed') return { credited: false, reason: 'already_credited', userId: dep.user_id };
      if (session.amount_total !== dep.amount || String(session.currency).toLowerCase() !== config.currency) {
        db.prepare("UPDATE deposits SET status = 'mismatch' WHERE id = ?").run(dep.id);
        return { credited: false, reason: 'amount_mismatch' };
      }
      db.prepare("UPDATE deposits SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), dep.id);
      const balance = adjustBalance(db, dep.user_id, dep.amount, 'deposit', null, session.id);
      return { credited: true, userId: dep.user_id, amount: dep.amount, balance };
    });
  }

  function markExpired(session) {
    db.prepare("UPDATE deposits SET status = 'expired' WHERE stripe_session_id = ? AND status = 'pending'").run(session.id);
  }

  async function handleWebhook(rawBody, signature) {
    requireStripe();
    if (!config.stripeWebhookSecret) throw new AppError(503, 'STRIPE_WEBHOOK_SECRET is not set');
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    } catch (err) {
      throw bad(`Webhook signature verification failed: ${err.message}`);
    }
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return { type: event.type, ...fulfill(event.data.object) };
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        markExpired(event.data.object);
        return { type: event.type, handled: true };
      default:
        return { type: event.type, ignored: true };
    }
  }

  async function confirmReturn(sessionId) {
    requireStripe();
    if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw bad('Invalid session id');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return fulfill(session);
  }

  return { enabled, createDeposit, handleWebhook, confirmReturn, fulfill };
}

module.exports = { makePayments };
