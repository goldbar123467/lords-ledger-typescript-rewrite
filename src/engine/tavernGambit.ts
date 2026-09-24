/** Knight's Gambit rules shared by the UI preview and reducer command. */
import { GAMBIT_WEAPONS, GAMBIT_WAGERS } from '../data/tavern.js';

const WEAPON_KEYS = ['sword', 'shield', 'arrow'] as const;
export type GambitWeapon = typeof WEAPON_KEYS[number];
export type GambitOutcome = 'win' | 'lose' | 'draw';

export interface GambitRound {
  player: GambitWeapon;
  opponent: GambitWeapon;
  outcome: GambitOutcome;
}

export function isGambitWeapon(value: unknown): value is GambitWeapon {
  return value === 'sword' || value === 'shield' || value === 'arrow';
}

export function isGambitWager(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && GAMBIT_WAGERS.includes(value);
}

export function resolveGambitRound(
  lastChoice: unknown,
  playerChoice: unknown,
  random: () => number,
): GambitRound | null {
  if (!isGambitWeapon(playerChoice) || (lastChoice !== null && !isGambitWeapon(lastChoice))) return null;
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError('Gambit random source must return a finite value in [0, 1).');
  }

  let opponent: GambitWeapon;
  if (lastChoice === null) {
    opponent = draw < 0.333 ? 'sword' : draw < 0.666 ? 'shield' : 'arrow';
  } else {
    const counter = WEAPON_KEYS.find(key => GAMBIT_WEAPONS[key].beats === lastChoice);
    if (!counter) throw new Error('Gambit content has no counter for a weapon.');
    const others = WEAPON_KEYS.filter(key => key !== counter);
    const first = others[0];
    const second = others[1];
    if (!first || !second) throw new Error('Gambit content has too few weapons.');
    opponent = draw < 0.4 ? counter : draw < 0.7 ? first : second;
  }

  const outcome: GambitOutcome = playerChoice === opponent ? 'draw' :
    GAMBIT_WEAPONS[playerChoice].beats === opponent ? 'win' : 'lose';
  return { player: playerChoice, opponent, outcome };
}
