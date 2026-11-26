// Renders the Send form + review screen with a mocked getBalance (every other RPC call is
// real). Lets you exercise the send UI without devnet funds. Nothing is signed.
// Usage: node e2e/send-review.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'e2e/screens';
const PW = 'Nocta-Test-Passw0rd!';
const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
mkdirSync(OUT, { recursive: true });

const fail = (m) => {
  console.error('✗', m);
  process.exitCode = 1;
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.route('https://api.devnet.solana.com/**', async (route) => {
  const body = route.request().postDataJSON?.();
  if (body?.method === 'getBalance')
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { context: { slot: 1 }, value: 2_000_000_000 } }) });
  return route.continue();
});

await p.goto(BASE);
await p.getByRole('button', { name: 'I already have a wallet' }).click();
await p.getByLabel('Recovery phrase').fill(PHRASE);
await p.getByRole('button', { name: 'Continue' }).click();
await p.getByLabel('New password').fill(PW);
await p.getByLabel('Confirm password').fill(PW);
await p.getByRole('checkbox').check();
await p.getByRole('button', { name: 'Import wallet' }).click();
await p.getByText('Recent activity').waitFor();
const addr = await p.evaluate(() => JSON.parse(localStorage.getItem('nocta:meta:v1')).accounts[0].publicKey);
if (addr !== 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk') fail(`unexpected derived address ${addr}`);
else console.log('✓ imported phrase derives standard address');

await p.goto(`${BASE}/#/send`);
await p.getByTestId('recipient').waitFor();
await p.getByTestId('recipient').fill('0xdeadbeef');
if (!(await p.getByText(/Ethereum/).count())) fail('EVM address not rejected');
await p.getByTestId('recipient').fill('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
await p.getByTestId('amount').fill('5');
if (!(await p.getByText('Exceeds your balance').count())) fail('over-balance not rejected');
await p.getByTestId('amount').fill('0.25');
await p.screenshot({ path: `${OUT}/send-form.png` });
await p.getByTestId('review').click();
await p.getByTestId('review-amount').waitFor({ timeout: 30_000 });
await p.screenshot({ path: `${OUT}/send-review.png`, fullPage: true });
// The account is really unfunded, so simulation must fail and confirmation must be impossible.
if (!(await p.getByTestId('confirm-send').isDisabled())) fail('confirm enabled despite failed simulation');
else console.log('✓ review blocks confirmation when simulation fails');

await b.close();
if (errs.length) fail(`page errors: ${errs.join('; ')}`);
console.log(process.exitCode ? 'FAILED' : 'send-review passed');
