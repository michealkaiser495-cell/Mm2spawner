const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TABLES } = require('../src/games/plinko');
const { crashPointFrom } = require('../src/games/crash');
const { multiplierFor: minesMult, placeMines } = require('../src/games/mines');
const { multiplierFor: diceMult } = require('../src/games/dice');
const { total } = require('../src/games/blackjack');
const { floats } = require('../src/fair');

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

test('plinko tables return between 98% and 100% to player', () => {
  for (const [rows, risks] of Object.entries(TABLES)) {
    for (const [risk, table] of Object.entries(risks)) {
      const n = Number(rows);
      assert.equal(table.length, n + 1);
      const rtp = table.reduce((s, m, k) => s + (m * binom(n, k)) / 2 ** n, 0);
      assert.ok(rtp > 0.98 && rtp < 1, `${rows}/${risk} RTP ${rtp}`);
    }
  }
});

test('crash point distribution: P(crash >= m) ~= 0.99/m', () => {
  const N = 200000;
  const fl = floats('a'.repeat(64), 'sim', 0, N);
  for (const m of [1.5, 2, 5, 10]) {
    const p = fl.filter((f) => crashPointFrom(f) >= m).length / N;
    assert.ok(Math.abs(p - 0.99 / m) < 0.01, `m=${m} p=${p}`);
  }
  assert.equal(crashPointFrom(0), 1);
  assert.ok(crashPointFrom(0.999999999) <= 1_000_000);
});

test('dice and mines multipliers carry a 1% edge', () => {
  assert.equal(diceMult(50, 'under'), 1.98);
  assert.equal(diceMult(98, 'over'), 49.5);
  for (const mines of [1, 3, 10, 24]) {
    const k = 1;
    const pWin = (25 - mines) / 25;
    assert.ok(Math.abs(minesMult(mines, k) * pWin - 0.99) < 0.001);
  }
  assert.equal(minesMult(24, 1), 24.75);
});

test('mine placement yields unique in-range tiles', () => {
  for (let nonce = 0; nonce < 200; nonce++) {
    const m = placeMines(floats('b'.repeat(64), 'x', nonce, 24), 10);
    assert.equal(new Set(m).size, 10);
    assert.ok(m.every((t) => t >= 0 && t < 25));
  }
});

test('blackjack hand totals handle soft aces', () => {
  const A = 0;
  const K = 12;
  const FIVE = 4;
  const SIX = 5;
  assert.deepEqual(total([A, K]), { value: 21, soft: true });
  assert.deepEqual(total([A, A]), { value: 12, soft: true });
  assert.deepEqual(total([A, FIVE, K]), { value: 16, soft: false });
  assert.deepEqual(total([A, SIX]), { value: 17, soft: true });
  assert.deepEqual(total([K, K, A]), { value: 21, soft: false });
});
