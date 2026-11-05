import { api, h, toast, toastError } from '../core.js';

export function renderFair(view) {
  const kv = h('div', { class: 'kv' }, h('div', { class: 'spinner' }));
  const seedInput = h('input', { type: 'text', maxlength: 64 });
  const verifyOut = h('div', { class: 'kv', style: { marginTop: '14px' } });

  async function load() {
    try {
      const f = await api('/fair');
      seedInput.value = f.clientSeed;
      kv.replaceChildren(
        h('div', { class: 'muted' }, 'Active server seed (hashed)'), h('div', { class: 'v' }, f.serverSeedHash),
        h('div', { class: 'muted' }, 'Client seed'), h('div', { class: 'v' }, f.clientSeed),
        h('div', { class: 'muted' }, 'Next nonce'), h('div', { class: 'v' }, f.nonce),
        h('div', { class: 'muted' }, 'Previous server seed'), h('div', { class: 'v' }, f.previousServerSeed || '—'),
        h('div', { class: 'muted' }, 'Previous seed hash'), h('div', { class: 'v' }, f.previousServerSeedHash || '—'),
      );
      if (f.previousServerSeed) {
        vServer.value = f.previousServerSeed;
      }
    } catch (err) {
      toastError(err);
    }
  }

  const saveSeed = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try {
      await api('/fair/client-seed', { method: 'POST', body: { clientSeed: seedInput.value.trim() } });
      toast('Client seed updated', 'ok');
      load();
    } catch (err) {
      toastError(err);
    }
  } }, 'Save');

  const rotate = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
    try {
      await api('/fair/rotate', { method: 'POST' });
      toast('Server seed rotated. The previous seed is now revealed.', 'ok');
      load();
    } catch (err) {
      toastError(err);
    }
  } }, 'Rotate server seed & reveal');

  const vServer = h('input', { type: 'text', placeholder: '64-character revealed server seed' });
  const vClient = h('input', { type: 'text', placeholder: 'Client seed used' });
  const vNonce = h('input', { type: 'number', min: 0, step: 1, value: 0 });
  const vMines = h('input', { type: 'number', min: 1, max: 24, step: 1, value: 3 });
  const verifyForm = h('form', {},
    h('div', { class: 'field' }, h('label', {}, 'Server seed'), vServer),
    h('div', { class: 'field' }, h('label', {}, 'Client seed'), vClient),
    h('div', { class: 'two-col' },
      h('div', { class: 'field' }, h('label', {}, 'Nonce'), vNonce),
      h('div', { class: 'field' }, h('label', {}, 'Mines count (for Mines)'), vMines),
    ),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Compute outcomes'),
    verifyOut,
  );
  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/fair/verify', {
        method: 'POST',
        body: { serverSeed: vServer.value.trim(), clientSeed: vClient.value.trim(), nonce: Number(vNonce.value), mines: Number(vMines.value) },
      });
      verifyOut.replaceChildren(
        h('div', { class: 'muted' }, 'SHA-256(server seed)'), h('div', { class: 'v' }, r.serverSeedHash),
        h('div', { class: 'muted' }, 'Dice roll'), h('div', { class: 'v' }, r.dice.toFixed(2)),
        h('div', { class: 'muted' }, 'Crash point'), h('div', { class: 'v' }, `${r.crash.toFixed(2)}x`),
        h('div', { class: 'muted' }, 'Roulette number'), h('div', { class: 'v' }, r.roulette),
        h('div', { class: 'muted' }, 'Plinko path (16 rows)'), h('div', { class: 'v' }, r.plinkoPath.join(' ')),
        h('div', { class: 'muted' }, 'Mine tiles (0-24)'), h('div', { class: 'v' }, r.mines.join(', ')),
        h('div', { class: 'muted' }, 'Blackjack deal order'), h('div', { class: 'v' }, r.blackjackCards.join(' ')),
      );
    } catch (err) {
      toastError(err);
    }
  });

  view.append(
    h('h1', {}, 'Provably fair'),
    h('p', { class: 'muted', style: { maxWidth: '760px' } },
      'Every result is HMAC-SHA256(serverSeed, "clientSeed:nonce:round"), split into 4-byte floats. You see the hash of the server seed before you bet, you choose the client seed, and the nonce increases with every bet. Rotate the server seed at any time to reveal the old one and check that every past result matches.'),
    h('div', { class: 'two-col' },
      h('section', { class: 'card' }, h('h2', {}, 'Your seeds'), kv,
        h('div', { class: 'field', style: { marginTop: '18px' } }, h('label', {}, 'Change client seed'), h('div', { class: 'input-group' }, seedInput, saveSeed)),
        rotate),
      h('section', { class: 'card' }, h('h2', {}, 'Verify a bet'), verifyForm),
    ),
  );
  load();
}
