const { tx } = require('../db');
const { bad } = require('../errors');
const { floats, nextSeed } = require('../fair');
const { adjustBalance, recordBet, balanceOf } = require('../wallet');
const { wagerOf, getActive, saveActive, clearActive, publicSeed } = require('./common');

const GAME = 'blackjack';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

const cardValue = (c) => Math.min(10, (c % 13) + 1);
const cardLabel = (c) => ({ rank: RANKS[c % 13], suit: SUITS[Math.floor(c / 13)] });

function total(cards) {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    sum += cardValue(c);
    if (c % 13 === 0) aces++;
  }
  const soft = aces > 0 && sum + 10 <= 21;
  return { value: soft ? sum + 10 : sum, soft };
}

const isBlackjack = (cards) => cards.length === 2 && total(cards).value === 21;

function draw(state) {
  const f = floats(state.seed.serverSeed, state.seed.clientSeed, state.seed.nonce, state.cursor + 1)[state.cursor];
  state.cursor++;
  return Math.floor(f * 52);
}

function actionsFor(state) {
  const hand = state.hands[state.active];
  if (!hand || hand.done) return [];
  const actions = ['hit', 'stand'];
  if (hand.cards.length === 2) {
    actions.push('double');
    if (state.hands.length === 1 && cardValue(hand.cards[0]) === cardValue(hand.cards[1])) actions.push('split');
  }
  return actions;
}

function handView(h) {
  const t = total(h.cards);
  return { cards: h.cards.map(cardLabel), total: t.value, soft: t.soft, wager: h.wager, done: h.done, doubled: h.doubled };
}

function view(state) {
  const up = state.dealer[0];
  return {
    active: true,
    hands: state.hands.map(handView),
    activeHand: state.active,
    dealer: { cards: [cardLabel(up), null], total: total([up]).value },
    actions: actionsFor(state),
    seed: publicSeed(state.seed),
  };
}

function finish(db, userId, state) {
  const dealerBJ = isBlackjack(state.dealer);
  const split = state.hands.length > 1;
  const playerBJ = !split && isBlackjack(state.hands[0].cards);
  const needsDealer = !dealerBJ && !playerBJ && state.hands.some((h) => total(h.cards).value <= 21);
  if (needsDealer) {
    while (total(state.dealer).value < 17) state.dealer.push(draw(state));
  }
  const dealerTotal = total(state.dealer).value;
  const outcomes = state.hands.map((h) => {
    const t = total(h.cards).value;
    if (playerBJ) return dealerBJ ? { result: 'push', payout: h.wager } : { result: 'blackjack', payout: Math.floor(h.wager * 2.5) };
    if (t > 21) return { result: 'bust', payout: 0 };
    if (dealerBJ) return { result: 'lose', payout: 0 };
    if (dealerTotal > 21 || t > dealerTotal) return { result: 'win', payout: h.wager * 2 };
    if (t === dealerTotal) return { result: 'push', payout: h.wager };
    return { result: 'lose', payout: 0 };
  });
  const wager = state.hands.reduce((s, h) => s + h.wager, 0);
  const payout = outcomes.reduce((s, o) => s + o.payout, 0);
  const hands = state.hands.map((h, i) => ({ ...handView(h), ...outcomes[i], done: true }));
  const dealer = { cards: state.dealer.map(cardLabel), total: dealerTotal, blackjack: dealerBJ };
  const betId = recordBet(db, userId, GAME, wager, payout, { hands, dealer }, state.seed);
  clearActive(db, userId, GAME);
  const balance = payout > 0 ? adjustBalance(db, userId, payout, 'win', GAME, String(betId)) : balanceOf(db, userId);
  return { active: false, hands, dealer, actions: [], wager, payout, balance, betId, seed: publicSeed(state.seed) };
}

function advance(db, userId, state) {
  while (state.active < state.hands.length && state.hands[state.active].done) state.active++;
  if (state.active >= state.hands.length) return finish(db, userId, state);
  saveActive(db, userId, GAME, state);
  return { ...view(state), balance: balanceOf(db, userId) };
}

function closeIfTwentyOneOrBust(hand) {
  if (total(hand.cards).value >= 21) hand.done = true;
}

function start(db, userId, body) {
  const wager = wagerOf(body.wager);
  return tx(db, () => {
    if (getActive(db, userId, GAME)) throw bad('Finish your current hand first');
    adjustBalance(db, userId, -wager, 'bet', GAME);
    const seed = nextSeed(db, userId);
    const state = { seed, cursor: 0, hands: [{ cards: [], wager, done: false, doubled: false }], dealer: [], active: 0 };
    state.hands[0].cards.push(draw(state));
    state.dealer.push(draw(state));
    state.hands[0].cards.push(draw(state));
    state.dealer.push(draw(state));
    if (isBlackjack(state.dealer) || isBlackjack(state.hands[0].cards)) return finish(db, userId, state);
    return advance(db, userId, state);
  });
}

function action(db, userId, body) {
  const act = body.action;
  return tx(db, () => {
    const state = getActive(db, userId, GAME);
    if (!state) throw bad('No hand in progress');
    if (!actionsFor(state).includes(act)) throw bad(`You can't ${act} right now`);
    const hand = state.hands[state.active];
    if (act === 'hit') {
      hand.cards.push(draw(state));
      closeIfTwentyOneOrBust(hand);
    } else if (act === 'stand') {
      hand.done = true;
    } else if (act === 'double') {
      adjustBalance(db, userId, -hand.wager, 'bet', GAME, 'double');
      hand.wager *= 2;
      hand.doubled = true;
      hand.cards.push(draw(state));
      hand.done = true;
    } else if (act === 'split') {
      adjustBalance(db, userId, -hand.wager, 'bet', GAME, 'split');
      const aces = hand.cards[0] % 13 === 0;
      const second = { cards: [hand.cards.pop()], wager: hand.wager, done: false, doubled: false };
      state.hands.push(second);
      for (const h of state.hands) {
        h.cards.push(draw(state));
        if (aces) h.done = true;
        else closeIfTwentyOneOrBust(h);
      }
    }
    return advance(db, userId, state);
  });
}

function status(db, userId) {
  const state = getActive(db, userId, GAME);
  return state ? view(state) : { active: false };
}

module.exports = { start, action, status, total, isBlackjack };
