import { mountDice } from './dice.js';
import { mountCrash } from './crash.js';
import { mountMines } from './mines.js';
import { mountBlackjack } from './blackjack.js';
import { mountPlinko } from './plinko.js';
import { mountRoulette } from './roulette.js';

export const GAMES = [
  { id: 'dice', name: 'Dice', icon: '🎲', tagline: 'Set your odds, roll 0–100', mount: mountDice },
  { id: 'crash', name: 'Crash', icon: '🚀', tagline: 'Cash out before it busts', mount: mountCrash },
  { id: 'mines', name: 'Mines', icon: '💣', tagline: 'Find gems, dodge mines', mount: mountMines },
  { id: 'blackjack', name: 'Blackjack', icon: '🃏', tagline: 'Beat the dealer to 21', mount: mountBlackjack },
  { id: 'plinko', name: 'Plinko', icon: '🔻', tagline: 'Drop it, up to 1000×', mount: mountPlinko },
  { id: 'roulette', name: 'Roulette', icon: '🎡', tagline: 'European single-zero wheel', mount: mountRoulette },
];
