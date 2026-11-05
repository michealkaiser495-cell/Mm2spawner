const path = require('node:path');
const Stripe = require('stripe');
const { openDb } = require('./db');
const { createApp } = require('./app');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const env = process.env;
const port = int(env.PORT, 3000);

const config = {
  siteName: env.SITE_NAME || 'Neon Vault',
  baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  currency: (env.CURRENCY || 'usd').toLowerCase(),
  signupBonus: int(env.SIGNUP_BONUS_CENTS, 1000),
  minDeposit: int(env.MIN_DEPOSIT_CENTS, 500),
  maxDeposit: int(env.MAX_DEPOSIT_CENTS, 50000),
  dailyDepositLimit: int(env.DAILY_DEPOSIT_LIMIT_CENTS, 100000),
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  secureCookies: (env.BASE_URL || '').startsWith('https://'),
  trustProxy: env.TRUST_PROXY === '1',
  rateLimit: env.DISABLE_RATE_LIMIT !== '1',
  minWithdraw: int(env.MIN_WITHDRAW_CENTS, 1000),
  discordContact: (env.DISCORD_CONTACT || 'wmz9').trim(),
  admins: new Set((env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
};

if (config.admins.size === 0) console.warn('ADMIN_USERNAMES not set: nobody can approve withdrawals.');
for (const [k, v] of Object.entries(config)) {
  if (typeof v === 'number' && (!Number.isInteger(v) || v < 0)) throw new Error(`Invalid numeric config for ${k}`);
}

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
if (!stripe) console.warn('STRIPE_SECRET_KEY not set: deposits are disabled.');
else if (env.STRIPE_SECRET_KEY.startsWith('sk_live_')) console.warn('Stripe LIVE key in use. Real cards will be charged.');

const db = openDb(env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'casino.db'));
const app = createApp({ db, config, stripe });

const server = app.listen(port, () => console.log(`${config.siteName} running at ${config.baseUrl} (port ${port})`));

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
