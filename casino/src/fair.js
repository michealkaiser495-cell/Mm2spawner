const crypto = require('node:crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newServerSeed = () => crypto.randomBytes(32).toString('hex');
const newClientSeed = () => crypto.randomBytes(8).toString('hex');

function floats(serverSeed, clientSeed, nonce, count) {
  const out = [];
  for (let round = 0; out.length < count; round++) {
    const h = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round}`).digest();
    for (let i = 0; i < 32 && out.length < count; i += 4) {
      out.push(h[i] / 256 + h[i + 1] / 256 ** 2 + h[i + 2] / 256 ** 3 + h[i + 3] / 256 ** 4);
    }
  }
  return out;
}

function nextSeed(db, userId) {
  const u = db.prepare('SELECT server_seed, client_seed, nonce FROM users WHERE id = ?').get(userId);
  db.prepare('UPDATE users SET nonce = nonce + 1 WHERE id = ?').run(userId);
  return { serverSeed: u.server_seed, serverSeedHash: sha256(u.server_seed), clientSeed: u.client_seed, nonce: u.nonce };
}

module.exports = { sha256, newServerSeed, newClientSeed, floats, nextSeed };
