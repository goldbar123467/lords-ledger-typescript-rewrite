/** Seeded encounter selection; the authored offer terms stay in the content registry. */
import { STRANGER_ENCOUNTERS } from '../data/tavern.js';

export type StrangerEncounterType = 'tip' | 'trade' | 'warning';

export function isStrangerEncounterType(value: unknown): value is StrangerEncounterType {
  return value === 'tip' || value === 'trade' || value === 'warning';
}

function drawUnit(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Tavern encounter random source must return a finite value in [0, 1).');
  }
  return value;
}

export function rollStrangerEncounter(random: () => number): StrangerEncounterType | null {
  if (drawUnit(random) >= 0.1) return null;
  const encounter = STRANGER_ENCOUNTERS[Math.floor(drawUnit(random) * STRANGER_ENCOUNTERS.length)];
  if (!isStrangerEncounterType(encounter?.type)) throw new Error('Unknown stranger encounter in content registry.');
  return encounter.type;
}

export function strangerTradeTerms(): { cost: number; food: number } {
  const encounter = STRANGER_ENCOUNTERS.find(item => item.type === 'trade');
  const cost = encounter?.cost;
  const food = encounter?.reward?.food;
  if (typeof cost !== 'number' || typeof food !== 'number' ||
      !Number.isSafeInteger(cost) || !Number.isSafeInteger(food) || cost <= 0 || food <= 0) {
    throw new Error('Stranger trade terms are invalid.');
  }
  return { cost, food };
}
