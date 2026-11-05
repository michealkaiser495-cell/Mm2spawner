# Neon Vault Casino

A full-stack casino website with:

- **Accounts:** sign-up (18+ confirmation), login and logout. Passwords are hashed with scrypt; sessions use httpOnly cookies.
- **Seven games, all decided on the server:** Crates (five tiers from $1 to $250, open up to 5 at once, prizes up to 1000×), Dice (with auto-bet), Crash, Mines, Blackjack (with double and split), Plinko (8/12/16 rows, three risk levels) and European Roulette.
- **Extras:** sound effects with a mute toggle, a big-win celebration at 10× and above, a live wins feed in the lobby, and an animated balance.
- **Provably fair results:** each bet comes from `HMAC-SHA256(serverSeed, clientSeed:nonce:round)`. Players see the hash of the server seed up front, can set their own client seed, and can rotate the server seed to reveal the old one. A built-in tool on the Fairness page re-checks any past result.
- **Stripe Checkout deposits:** balances are credited by a signature-verified webhook and again when the player returns from Checkout. Crediting is idempotent, so a deposit never lands twice. The server also checks the amount and currency, and enforces min/max per deposit plus a 24-hour deposit limit.
- **Withdrawals:** players submit a request (amount, payout method, payout details, Discord name). The amount is taken from their balance straight away and they're told to DM `DISCORD_CONTACT` (default **wmz9**) on Discord with the request ID. Admins pay the player outside the site, then mark the request **Paid** at `#/admin`. **Reject** refunds the balance, and players can cancel while a request is pending. Rules: at least one real deposit (the sign-up bonus can't be withdrawn), deposits must be wagered through once, and only one pending request at a time.
- **Wallet:** balance, deposit and withdrawal history, a full transaction ledger and bet history with stats.
- **Admin page** (`ADMIN_USERNAMES`): player count, deposits, payouts, pending withdrawals, house profit and total player balances.

Stack: Node.js 22.5+, Express 5, built-in `node:sqlite`, vanilla JS front end (no build step).

## Run it

```bash
cd casino
npm install
cp .env.example .env        # add your Stripe test keys
npm start                   # http://localhost:3000
```

Without `STRIPE_SECRET_KEY` the site still runs. Deposits are turned off, and new players get the sign-up bonus (`SIGNUP_BONUS_CENTS`, $10 by default) to play with.

### Stripe locally

1. Copy your **test** secret key from the Stripe Dashboard (Developers → API keys) into `STRIPE_SECRET_KEY`.
2. Forward webhooks with the Stripe CLI and put the printed `whsec_...` value in `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. Deposit with test card `4242 4242 4242 4242`, any future expiry date and any CVC.

In production, add a Dashboard webhook endpoint at `https://YOUR_DOMAIN/api/stripe/webhook` for these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`.

## Tests

```bash
npm test
```

The 21 tests cover:

- sign-up and login validation, sessions, and CSRF/origin blocking
- every game's payout accounting, plus re-deriving dice and mines results from the revealed seed
- crash cash-out, bust and auto cash-out
- 40 blackjack hands played out with doubles and splits
- the Stripe flow: forged webhook signatures rejected, replayed webhooks ignored, tampered amounts rejected, daily limit enforced
- house-edge math: every Plinko table pays back 98–100%, the crash distribution, the dice and mines multipliers, and the crate odds
- crates, the full withdrawal lifecycle including admin pay/reject, and the live feed's username masking
- a real paid Checkout session from the Stripe test account (`test/fixtures/stripe-paid-session.json`) going through the signed webhook and crediting the balance

## House edge

| Game | Return to player |
| --- | --- |
| Crates | 95% (Bronze) → 95.5% → 96% → 96.5% → 97% (Vault) |
| Dice, Crash, Mines | 99% |
| Plinko | 98.9–99.1% depending on table |
| Roulette | 97.3% (single zero) |
| Blackjack | about 99.5% with basic strategy (3:2 payout, dealer stands on soft 17) |

## Legal: read this before taking real money

Taking real-money deposits for games of chance is **regulated gambling** in most places. You need a gambling licence for every jurisdiction you accept players from, plus age and identity checks (KYC/AML).

Stripe **does not allow gambling businesses without prior written approval** (see Stripe's Restricted Businesses list). Running this on a live key without that approval will get the account shut down and the funds held.

Keep it on `sk_test_` keys until you have both a licence and Stripe's approval. Paying out winnings by hand through Discord DMs is also the kind of setup payment processors and regulators look at closely, so keep the admin page's records accurate.

## Layout

```
src/
  server.js       env/config, Stripe client, startup and shutdown
  app.js          routes, security headers, CSRF and origin guard, rate limits
  auth.js         sign-up, login, sessions, scrypt hashing
  payments.js     Stripe Checkout, webhook verification, idempotent crediting
  fair.js         seed handling and HMAC float generation
  verify.js       recomputes outcomes from a revealed seed
  wallet.js       balance ledger and bet records
  games/          dice, crash, mines, blackjack, plinko, roulette
public/
  index.html, styles.css
  js/core.js      API client, DOM helpers, shared bet controls
  js/pages/       auth, lobby, wallet, fairness, history
  js/games/       one UI module per game
test/             API integration tests and house-edge math tests
```
