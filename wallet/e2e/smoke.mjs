// End-to-end smoke test: drives the real app in Chromium against a running server.
// Usage: node e2e/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Uses the project's playwright if installed, else a globally available one.
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'e2e/screens';
mkdirSync(OUT, { recursive: true });
const PASSWORD = '112940'; // numeric passcode

const errors = [];
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
// The app now defaults to Mainnet (verified by send-review.mjs). Run this UI walkthrough on
// Devnet so the public RPC doesn't rate-limit the long click sequence into instability.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('nocta:settings:v1', JSON.stringify({ state: { network: 'devnet', mainnetAcknowledged: true }, version: 1 }));
  } catch {
    /* storage blocked */
  }
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|429|ERR_|net::/.test(m.text())) errors.push(`console: ${m.text()}`);
});
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---- Onboarding: create wallet
await page.goto(BASE);
await page.getByRole('button', { name: 'Create a new wallet' }).click();
await page.getByLabel('Create a passcode').fill(PASSWORD);
await page.getByLabel('Confirm passcode').fill(PASSWORD);
await page.getByRole('checkbox').check();
await shot('01-password');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByText('Reveal recovery phrase').click();
const words = await page.locator('ol li span.font-medium').allTextContents();
if (words.length !== 12) throw new Error(`expected 12 words, got ${words.length}`);
await shot('02-phrase');
await page.getByText('I have written down').click();
await page.getByRole('button', { name: 'Continue' }).click();
for (const p of await page.getByText(/^Select word #\d+$/).allTextContents()) {
  const idx = Number(p.match(/#(\d+)/)[1]) - 1;
  const block = page.locator('div', { has: page.getByText(p, { exact: true }) }).last();
  await block.getByRole('button', { name: words[idx], exact: true }).first().click();
}
await shot('03-verify');
await page.getByRole('button', { name: 'Verify backup' }).click();
await page.waitForURL(/#\/$/);
await page.getByText('Recent activity').waitFor();
log('wallet created, dashboard loaded');
await page.waitForTimeout(2500);
await shot('04-dashboard');

const address = await page.evaluate(() => JSON.parse(localStorage.getItem('nocta:meta:v1')).accounts[0].publicKey);
log('address', address);
const allStorage = await page.evaluate(() => JSON.stringify(localStorage));
// A leaked phrase would be stored as space-joined words; base64 ciphertext never contains spaces,
// so adjacent-word pairs can't collide by chance (unlike single short words, which can).
const pairs = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);
if (allStorage.includes(words.join(' ')) || pairs.some((p) => allStorage.includes(p)))
  throw new Error('recovery phrase found in storage!');
// The vault must be well-formed AES-GCM ciphertext (not plaintext JSON of the phrase).
const vault = await page.evaluate(() => JSON.parse(localStorage.getItem('nocta:vault:v1')));
if (vault.cipher?.name !== 'AES-GCM' || !vault.data) throw new Error('vault is not encrypted!');
log('vault encrypted at rest ✓');

await page.getByText('Need test SOL?').waitFor({ timeout: 15000 });

// ---- Devnet airdrop (rate limited / faucet may be closed; best-effort only)
await page
  .getByTestId('airdrop')
  .click({ timeout: 10_000 })
  .then(() => page.waitForTimeout(12_000))
  .catch((e) => log('airdrop step skipped:', e.message.split('\n')[0]));
await page.getByRole('button', { name: 'Refresh balances' }).click();
await page.waitForTimeout(2500);
const total = (await page.getByTestId('portfolio-total').count()) ? await page.getByTestId('portfolio-total').textContent() : '(RPC unavailable)';
log('portfolio after airdrop:', total);
await shot('05-after-airdrop');

// ---- Pages
const visit = async (hash, name, waitFor) => {
  await page.goto(`${BASE}/#${hash}`);
  if (waitFor) await page.getByText(waitFor).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(name);
  log('visited', hash);
};
await visit('/receive', '06-receive', 'Your Solana address');
const shown = await page.getByTestId('receive-address').textContent();
if (shown !== address) throw new Error('receive address mismatch');
// Each external coin tab must derive a valid, correctly-formatted receive address.
const externals = [
  ['Bitcoin', /^bc1[0-9ac-hj-np-z]{20,}$/],
  ['Ethereum', /^0x[0-9a-fA-F]{40}$/],
  ['Litecoin', /^ltc1[0-9ac-hj-np-z]{20,}$/],
  ['Dogecoin', /^D[1-9A-HJ-NP-Za-km-z]{25,39}$/],
];
for (const [name, re] of externals) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page.getByTestId('external-address').waitFor({ timeout: 15000 });
  const addr2 = (await page.getByTestId('external-address').textContent())?.trim();
  if (!re.test(addr2)) throw new Error(`invalid ${name} address shown: ${addr2}`);
  log(`${name} receive address ✓`, addr2);
}
await page.getByRole('button', { name: /^Litecoin/ }).click();
await page.waitForTimeout(1200);
await shot('06b-receive-ltc');
await visit('/buy', '07-buy', 'Buy USDC');
await visit('/send', '08-send', 'Send');

// Send flow validation (no funds needed for validation)
if (await page.getByTestId('recipient').count()) {
  await page.getByTestId('recipient').fill('0xabc');
  await page.getByText(/Ethereum\/EVM address/).waitFor();
  await page.getByTestId('recipient').fill('11111111111111111111111111111111');
  await page.getByText(/system program/).waitFor();
  log('send address validation ✓');
}

await visit('/swap', '09-swap', 'You pay');
await page.getByTestId('swap-amount').fill('0.5');
await page.waitForTimeout(4000);
log('swap quote out:', await page.getByTestId('swap-out').textContent());
await shot('10-swap-quote');

await visit('/explore', '11-explore', 'Market cap');
await page.locator('main button.grid').first().click();
await page.getByText('Token details').waitFor();
await page.waitForTimeout(2500);
await shot('12-token-detail');
log('token detail ✓');

await visit('/activity', '13-activity', 'Activity');
for (const s of ['wallets', 'security', 'backup', 'network', 'display', 'privacy', 'about']) await visit(`/settings/${s}`, `14-settings-${s}`);

// Add a derived account
await page.goto(`${BASE}/#/settings/wallets`);
await page.getByTestId('add-account').click();
await page.getByTestId('derive-account').click();
await page.getByText('Account 2').first().waitFor();
log('derived account 2 ✓');

// ---- Lock / unlock
await page.goto(`${BASE}/#/settings/security`);
await page.getByRole('button', { name: 'Lock', exact: true }).click();
await page.waitForURL(/unlock/);
await page.getByLabel('Passcode', { exact: true }).fill('999999');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.getByText('Incorrect passcode').waitFor();
await shot('15-unlock-error');
await page.getByLabel('Passcode', { exact: true }).fill(PASSWORD);
await page.getByRole('button', { name: 'Unlock' }).click();
// Unlock returns you to the screen you locked from.
await page.waitForURL((u) => !u.hash.includes('unlock'));
await page.getByRole('navigation', { name: 'Main' }).first().waitFor();
log('lock/unlock ✓ (returned to', new URL(page.url()).hash + ')');

// Reload keeps the wallet unlocked (session persists until tab close / lock / auto-lock).
await page.goto(`${BASE}/#/`);
await page.reload();
await page.getByText('Recent activity').waitFor({ timeout: 15000 });
if (page.url().includes('unlock')) throw new Error('reload should NOT lock the wallet');
log('reload keeps wallet unlocked ✓');

// ---- Mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(2000);
await shot('16-mobile-dashboard');
await page.goto(`${BASE}/#/send`);
await page.waitForTimeout(1000);
await shot('17-mobile-send');
await page.goto(`${BASE}/#/swap`);
await page.waitForTimeout(1000);
await shot('18-mobile-swap');

await browser.close();
console.log(`\nJS errors: ${errors.length}`);
errors.forEach((e) => console.log('  ', e));
console.log(JSON.stringify({ address, words: words.length }));
process.exit(errors.length ? 1 : 0);
