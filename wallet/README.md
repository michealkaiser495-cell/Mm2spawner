# Nocta Wallet

A self-custody Solana wallet for the browser. Keys are generated and encrypted on your device
and never leave it. Every transaction is simulated and inspected before you can sign it.

> **Status: development build.** It starts on **Solana Devnet**. Read [SECURITY.md](./SECURITY.md)
> before using it with real funds. The code has not had an independent security audit.

## Features

| Area | What works |
| --- | --- |
| **Wallet creation** | BIP-39 recovery phrases (12 or 24 words), backup quiz, password-encrypted vault |
| **Import** | Recovery phrase (with account discovery), base58 private key, `solana-keygen` JSON array |
| **Accounts** | Multiple recovery phrases and imported keys, derived accounts, rename, switch, remove |
| **Dashboard** | Portfolio value, 24H / 7D / 1M / 1Y chart, token holdings, recent activity, token search |
| **Send** | SOL and SPL / Token-2022 transfers, address validation, fee and rent estimates, simulation, review screen, pending / confirmed / failed states, duplicate-send guard |
| **Receive** | Address, QR code, copy and share, network selector, wrong-network warnings |
| **Swap** | Live Jupiter quotes, slippage settings, price impact, minimum received, review, confirmation (Mainnet only) |
| **Explore** | Trending, top and most-traded tokens, search by name, symbol or mint, token detail with chart, market data, audit flags and verification status |
| **Activity** | Full history with filters, pagination and a detail view (balance changes, fee, programs, Explorer link) |
| **Settings** | Wallets, security (password, auto-lock, sign-with-password, clipboard clearing), recovery and backup, network and custom RPCs, currency, theme, privacy, about, reset |

These are deliberately **not implemented**, and the app says so where they would appear:

- **Buy with card or bank.** This needs a licensed on-ramp partner. The Buy screen explains this and points to the alternatives.
- **Light theme.** It is marked "Not yet available".
- **Ethereum and other chains.** They show as "soon". The chain layer is modular (`src/lib/chains/registry.ts`).
- **dApp connections and message signing.** No external site can ask Nocta to sign anything.

The app has no demo mode and no fake data. Every balance, price and transaction comes from the
live network or a public API. On testnets, a USD figure is a reference value (devnet SOL × the
Mainnet SOL price) and is labelled as one. You can turn it off in Settings → Privacy.

## Run locally

Requires **Node.js 20+**.

```bash
cd wallet
npm install
npm run dev          # http://localhost:5173
```

Production build. It adds a strict Content-Security-Policy:

```bash
npm run build
npm run preview      # http://localhost:4173
```

### Getting test SOL

The public RPC faucets for devnet and testnet are closed (they return HTTP 410). To get test SOL:

1. Click **Open faucet** on the Home screen. Your address is copied for you.
2. Paste the address at https://faucet.solana.com.

The **RPC airdrop** button still works with a custom RPC that runs a faucet, such as a local
`solana-test-validator`.

### Mainnet

Switching to Mainnet needs a one-time confirmation. The public Mainnet RPC is heavily
rate-limited, so for real use add a dedicated provider URL (Helius, Triton, QuickNode and so on)
in **Settings → Network**. Nocta checks that each endpoint is on the right cluster by comparing
its genesis hash.

## Tests

```bash
npm test              # unit tests: key derivation vectors, vault crypto, amount math,
                      # address validation, transaction guard, history parsing
npm run typecheck

# with `npm run preview` running in another terminal:
npm run test:e2e      # browser: create, backup quiz, every page, lock/unlock, mobile layout
node e2e/send-review.mjs   # browser: import, Send validation, review blocks failed simulation
npm run test:chain    # live RPC, read-only: transfer simulation on devnet;
                      # Jupiter swap build, guard and simulation on mainnet
```

The browser tests use Playwright's Chromium.

## Architecture

```
src/
  lib/
    crypto/     keys.ts (BIP-39, SLIP-0010), vault.ts (PBKDF2 + AES-GCM), encoding.ts
    security/   txGuard.ts — instruction-level inspection of every transaction
    solana/     networks, balances, history parsing, transfers, swap, address checks, errors
    api/        jupiter.ts (tokens, prices, quotes, swap tx), coingecko.ts (charts, FX)
    chains/     registry.ts — chain adapter interface (Solana enabled; others planned)
  state/        wallet.ts (vault + accounts), session.ts (in-memory secrets), settings.ts
  hooks/        React Query data hooks (portfolio, history, charts, fiat, auto-lock…)
  components/   ui/ primitives, layout/ app shell, wallet/ domain components
  pages/        onboarding, unlock, dashboard, send, receive, buy, swap, explore,
                token detail, activity, tx detail, settings/*
```

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS v4 · Radix UI primitives · TanStack
Query · Zustand · `@solana/web3.js` · `@solana/spl-token` · `@scure/bip39` ·
`micro-key-producer` (SLIP-0010) · Recharts · qrcode.react · sonner.

**Data providers:** your Solana RPC, Jupiter (token registry, prices, swap routing), CoinGecko
(price history, FX rates). The app has no backend.

### Adding a chain

1. Implement `ChainAdapter` in `src/lib/chains/registry.ts`.
2. Add a derivation path next to `solanaPath` in `lib/crypto/keys.ts`. Keyrings store the
   mnemonic, so new chains derive from the same phrase.
3. Add balance, history and transfer modules that mirror `lib/solana/*`, plus a guard for that
   chain's transaction format.
4. Set the adapter to `enabled: true`.
