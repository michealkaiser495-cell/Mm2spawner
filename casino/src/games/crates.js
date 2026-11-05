const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { publicSeed } = require('./common');

const GAME = 'crates';
const MAX_QTY = 5;
const RARITIES = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const def = (id, name, price, color, mults, weights, items) => ({
  id, name, price, color,
  items: items.map(([itemName, icon], i) => ({ name: itemName, icon, mult: mults[i], weight: weights[i], rarity: RARITIES[i] })),
});

const CRATES = [
  def('bronze', 'Bronze Crate', 100, '#c47a3d',
    [0.1, 0.3, 0.6, 1, 1.5, 3, 8, 20],
    [423732, 204507, 129149, 92041, 70342, 44422, 23181, 12626],
    [['Bent Nail', '🔩'], ['Copper Coin', '🪙'], ['Lucky Penny', '🍀'], ['Pocket Watch', '⌚'], ['Silver Key', '🗝️'], ['Ruby Ring', '💍'], ['Gold Bar', '🧈'], ['Bronze Crown', '👑']]),
  def('silver', 'Silver Crate', 500, '#a9b4c8',
    [0.1, 0.25, 0.5, 1, 2, 5, 15, 50],
    [443753, 231132, 141113, 86154, 52599, 27397, 12533, 5319],
    [['Dull Pebble', '🪨'], ['Old Compass', '🧭'], ['Glass Marble', '🔮'], ['Silver Chain', '⛓️'], ['Sapphire', '💠'], ['Silver Chalice', '🏆'], ['Moonstone', '🌙'], ['Silver Dragon', '🐉']]),
  def('gold', 'Gold Crate', 2500, '#f2c14e',
    [0.05, 0.2, 0.5, 1, 2.5, 7, 25, 100],
    [534433, 210691, 113881, 71504, 38649, 19359, 8236, 3247],
    [['Fool\'s Gold', '🟨'], ['Gold Leaf', '🍂'], ['Gold Watch', '🕰️'], ['Gold Ingot', '🧱'], ['Emerald', '💚'], ['Golden Goblet', '🍷'], ['Sun Medallion', '☀️'], ['Golden Phoenix', '🔥']]),
  def('diamond', 'Diamond Crate', 10000, '#5ad8ff',
    [0.05, 0.15, 0.4, 1, 3, 10, 50, 250],
    [520381, 242667, 122806, 64997, 30310, 13137, 4297, 1405],
    [['Quartz Shard', '🔹'], ['Crystal Prism', '🔷'], ['Ice Gem', '🧊'], ['Diamond Stud', '💎'], ['Star Sapphire', '⭐'], ['Diamond Tiara', '👸'], ['Comet Core', '☄️'], ['Heart of Ice', '❄️']]),
  def('vault', 'Vault Crate', 25000, '#b26bff',
    [0.02, 0.1, 0.3, 1, 4, 15, 100, 1000],
    [614048, 210638, 101474, 45577, 18135, 7532, 2134, 462],
    [['Dust Bunny', '🌫️'], ['Vault Token', '🎟️'], ['Black Pearl', '⚫'], ['Neon Relic', '🧿'], ['Void Crystal', '🟣'], ['Galaxy Orb', '🌌'], ['Infinity Gauntlet', '🧤'], ['The Vault Heart', '💜']]),
];

const BY_ID = new Map(CRATES.map((c) => [c.id, c]));
const TOTAL_WEIGHT = (c) => c.items.reduce((s, i) => s + i.weight, 0);

function pick(crate, f) {
  let r = f * TOTAL_WEIGHT(crate);
  for (let i = 0; i < crate.items.length; i++) {
    r -= crate.items[i].weight;
    if (r < 0) return i;
  }
  return crate.items.length - 1;
}

function catalog() {
  return CRATES.map((c) => {
    const total = TOTAL_WEIGHT(c);
    return {
      id: c.id, name: c.name, price: c.price, color: c.color,
      rtp: Math.round((c.items.reduce((s, i) => s + i.mult * i.weight, 0) / total) * 10000) / 100,
      items: c.items.map((i) => ({ name: i.name, icon: i.icon, rarity: i.rarity, mult: i.mult, value: Math.floor(c.price * i.mult), chance: Math.round((i.weight / total) * 1e6) / 1e4 })),
    };
  });
}

function open(db, userId, body) {
  const crate = typeof body.crate === 'string' ? BY_ID.get(body.crate) : undefined;
  if (!crate) throw bad('Unknown crate');
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw bad(`You can open 1-${MAX_QTY} crates at once`);
  const wager = crate.price * quantity;
  return tx(db, () => {
    adjustBalance(db, userId, -wager, 'bet', GAME);
    const seed = nextSeed(db, userId);
    const items = floats(seed.serverSeed, seed.clientSeed, seed.nonce, quantity).map((f) => {
      const index = pick(crate, f);
      const it = crate.items[index];
      return { index, name: it.name, icon: it.icon, rarity: it.rarity, mult: it.mult, value: Math.floor(crate.price * it.mult) };
    });
    const payout = items.reduce((s, i) => s + i.value, 0);
    const detail = { crate: crate.id, quantity, items };
    const betId = recordBet(db, userId, GAME, wager, payout, detail, seed);
    const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', GAME, String(betId)) : balanceOf(db, userId);
    return { ...detail, wager, payout, balance, betId, seed: publicSeed(seed) };
  });
}

module.exports = { open, catalog, pick, CRATES };
