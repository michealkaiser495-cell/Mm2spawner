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
const PASSWORD = 'Nocta-Test-Passw0rd!';

const errors = [];
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|429|ERR_|net::/.test(m.text())) errors.push(`console: ${m.text()}`);
});
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---- Onboarding: create wallet
await page.goto(BASE);
await page.getByRole('button', { name: 'Create a new wallet' }).click();
await page.getByLabel('New password').fill(PASSWORD);
await page.getByLabel('Confirm password').fill(PASSWORD);
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
const vaultRaw = await page.evaluate(() => localStorage.getItem('nocta:vault:v1'));
if (words.some((w) => vaultRaw.includes(w))) throw new Error('plaintext word found in stored vault!');
const allStorage = await page.evaluate(() => JSON.stringify(localStorage));
if (allStorage.includes(words.join(' '))) throw new Error('phrase found in localStorage!');
log('vault encrypted at rest ✓');

// ---- Devnet airdrop (rate limited; tolerate failure)
await page.getByTestId('airdrop').click();
await page.waitForTimeout(12_000);
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
await visit('/buy', '07-buy', 'Not yet implemented');
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
await page.getByLabel('Password', { exact: true }).fill('wrong-password');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.getByText('Incorrect password').waitFor();
await shot('15-unlock-error');
await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
await page.getByRole('button', { name: 'Unlock' }).click();
// Unlock returns you to the screen you locked from.
await page.waitForURL((u) => !u.hash.includes('unlock'));
await page.getByRole('navigation', { name: 'Main' }).first().waitFor();
log('lock/unlock ✓ (returned to', new URL(page.url()).hash + ')');

// Reload must lock (secrets are memory-only)
await page.reload();
await page.waitForURL(/unlock/);
log('reload locks wallet ✓');
await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
await page.getByRole('button', { name: 'Unlock' }).click();
await page.waitForURL((u) => !u.hash.includes('unlock'));

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
