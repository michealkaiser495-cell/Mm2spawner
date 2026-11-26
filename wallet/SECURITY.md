# Nocta security model

## Keys and secrets

| | |
| --- | --- |
| Generation | `@scure/bip39` (audited) draws its randomness from WebCrypto `getRandomValues`. |
| Derivation | SLIP-0010 ed25519 via `micro-key-producer` (audited, by the author of `@noble`). The path is `m/44'/501'/n'/0'`, checked against the standard test vector (`abandon … about` → `HAgk14Jp…`). |
| Storage | One encrypted vault in `localStorage`, using **PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte random salt) → AES-256-GCM (random 96-bit IV for every write, with associated data)**. All of this is WebCrypto. Nocta contains no custom cryptography. |
| In memory | The decrypted vault lives only in a module-scoped variable (`state/session.ts`). It is never in React state and never persisted. The derived AES key is a **non-extractable** `CryptoKey`. A signing keypair is built only for the moment it is needed, and its bytes are wiped afterwards (best effort, because JavaScript cannot guarantee memory zeroisation). |
| Locking | The wallet locks after a configurable idle time (1 minute to 4 hours), on Lock, and on every page reload. |
| Unlock throttling | Exponential back-off starts after 3 failed attempts and caps at 5 minutes. |
| Re-authentication | Revealing a phrase or private key always re-decrypts the vault with the password you enter. You can also require the password before every signature. |
| Clipboard | Copied secrets are cleared from the clipboard after a configurable delay. Copying is marked "not recommended". |
| Logging | The code never logs secrets. Errors shown to users pass through `friendlyError`, which only sees RPC messages. |
| Transmission | Phrases, keys and passwords never leave the device. Nocta has no backend. |

Non-secret metadata (account names, public keys, settings) is stored in plaintext so the lock
screen and account list work. It reveals which addresses you use, but not how to spend from them.

## Transactions

Nothing is signed without explicit confirmation on a review screen. Before that screen appears,
every transaction goes through these checks:

1. **Simulation** against the RPC. If simulation fails, you cannot confirm.
2. **Instruction guard** (`lib/security/txGuard.ts`). Address lookup tables are resolved first.
   The guard **blocks**:
   - a fee payer other than the active account
   - any transaction that needs more than one signature
   - SPL token `Approve` and `ApproveChecked`. Nocta never grants token allowances, limited or unlimited.
   - SPL token `SetAuthority`
   - `CloseAccount` that sends the reclaimed rent anywhere but you
   - System `Assign` or `AssignWithSeed` on your wallet account
3. **Swap checks.** A Jupiter-built transaction must invoke the Jupiter v6 program. It must also
   pass the guard and simulation. The test suite checks that the guard rejects a swap built for a
   different wallet.
4. **Transfer checks.**
   - The recipient must be valid base58 for the canonical key. EVM and BTC formats are rejected.
   - System programs, token mints and token accounts are refused as recipients.
   - The review warns when the recipient is a program-derived address, a brand-new address, or your own address.
   - Rent-exempt minimums are enforced for both the recipient and your remaining balance.
5. **Duplicate guard.** An identical send (same network, account, recipient, token and amount)
   within 3 minutes needs an extra confirmation. A per-flow lock also prevents double
   submission.
6. **Fresh blockhash.** Transfers are recompiled with a fresh blockhash right before signing. The
   instructions stay identical, and the guard runs again on the exact bytes being signed.

Mainnet requires a one-time acknowledgement. The review screen labels Mainnet as "Real funds".
Development starts on Devnet.

## Tokens

Nocta never calls a token "safe". It shows "Verified" only when Jupiter's registry lists the token
as verified, and the tooltip says this confirms identity, not safety. Unknown tokens are labelled
"Unverified", along with a warning about impersonation. Mint and freeze authorities and Jupiter's
suspicious-token flag are shown when known. Remote logos load with `referrerPolicy=no-referrer`,
and only `https:` links are rendered.

## Web hardening

- **Strict CSP in production builds.** It sets `script-src 'self'` (no inline scripts, no eval),
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and `frame-src 'none'`.
- **`<meta name="referrer" content="no-referrer">`.**
- **React escaping only.** There is no `dangerouslySetInnerHTML` anywhere.
- **Credentials omitted.** Calls to data APIs use `credentials: 'omit'`.
- **Validated settings and RPC endpoints.** Persisted settings are sanitised on load. Custom RPC
  URLs must use `https:` (or localhost) and must match the expected genesis hash.

## Known limitations

- **Browser storage.** `localStorage` is readable by any script on the same origin. The vault is
  encrypted, but an XSS bug or a malicious browser extension could capture the password as you
  type it. Serve the app from a dedicated origin and keep the CSP.
- **Memory.** JavaScript strings cannot be zeroised, so decrypted mnemonics stay in memory until
  garbage collection.
- **Offline brute force.** Anyone who copies the encrypted vault can brute-force a weak password
  offline. The password meter blocks weak passwords, but use a long one.
- **No audit.** No independent audit has been performed. Do not hold significant value until one has.
- **Dependency advisories.** `npm audit` reports `bigint-buffer` (GHSA-3gc7-fjrx-p6mg), which
  comes in through `@solana/spl-token`, plus moderate advisories in the Node-only RPC transport
  of `@solana/web3.js` (`jayson`, `uuid`, `stream-json`). No compatible fix exists upstream. In
  the browser, `bigint-buffer` runs its pure-JS fallback, not the native code the advisory
  describes. Migrating to `@solana/kit` removes these dependencies.
- **Third-party providers.** RPC, Jupiter and CoinGecko responses are trusted for display. Signing
  decisions rely on local simulation and the local guard.
