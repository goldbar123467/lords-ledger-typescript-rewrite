/** Saved Bard content and reward bookkeeping. Authored prose stays in the Tavern registry. */
import { BARD_RIDDLES, BARD_STATE_COMMENTS, BARD_TALES } from '../data/tavern.js';

export type BardContent =
  | { type: 'tale'; index: number; repeat: boolean }
  | { type: 'comment'; index: number }
  | { type: 'riddle'; id: string; optionOrder: number[]; answer: string | null; awarded: boolean };

export interface BardNext {
  content: BardContent;
  talesRemaining: number[];
  talesServed: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueIndexList(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length <= length &&
    value.every(index => Number.isSafeInteger(index) && index >= 0 && index < length) &&
    new Set(value).size === value.length;
}

function drawUnit(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Bard random source must return a finite value in [0, 1).');
  }
  return value;
}

export function isBardSolvedIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= BARD_RIDDLES.length &&
    value.every(id => typeof id === 'string' && BARD_RIDDLES.some(riddle => riddle.id === id)) &&
    new Set(value).size === value.length;
}

export function isBardTaleQueue(value: unknown): value is number[] {
  return isUniqueIndexList(value, BARD_TALES.length);
}

export function isBardContent(value: unknown): value is BardContent | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (value.type === 'tale') {
    return Number.isSafeInteger(value.index) && (value.index as number) >= 0 &&
      (value.index as number) < BARD_TALES.length && typeof value.repeat === 'boolean';
  }
  if (value.type === 'comment') {
    return Number.isSafeInteger(value.index) && (value.index as number) >= 0 &&
      (value.index as number) < BARD_STATE_COMMENTS.length;
  }
  if (value.type === 'riddle') {
    const riddle = BARD_RIDDLES.find(item => item.id === value.id);
    if (!riddle || !Array.isArray(value.optionOrder) ||
        !isUniqueIndexList(value.optionOrder, riddle.options.length) ||
        value.optionOrder.length !== riddle.options.length ||
        (value.answer !== null &&
          (typeof value.answer !== 'string' || !riddle.options.includes(value.answer))) ||
        typeof value.awarded !== 'boolean') return false;
    return !value.awarded || value.answer === riddle.answer;
  }
  return false;
}

/** The legacy 60/25/15 content mix, with a no-repeat tale bag and shuffled riddle options. */
export function nextBardContent(
  random: () => number,
  talesRemaining: unknown,
  talesServed: unknown,
  commentIndex: unknown,
): BardNext | null {
  if (!isBardTaleQueue(talesRemaining) || !Number.isSafeInteger(talesServed) ||
      (talesServed as number) < 0 || !Number.isSafeInteger(commentIndex) ||
      (commentIndex as number) < 0 || (commentIndex as number) >= BARD_STATE_COMMENTS.length) return null;
  const roll = drawUnit(random);
  if (roll < 0.6) {
    if ((talesServed as number) >= Number.MAX_SAFE_INTEGER) return null;
    const pool = talesRemaining.length > 0 ? [...talesRemaining] : BARD_TALES.map((_, index) => index);
    const slot = Math.floor(drawUnit(random) * pool.length);
    const picked = pool.splice(slot, 1)[0];
    if (picked === undefined) throw new Error('Bard tale selection found an empty bag.');
    return {
      content: { type: 'tale', index: picked, repeat: (talesServed as number) >= BARD_TALES.length },
      talesRemaining: pool,
      talesServed: (talesServed as number) + 1,
    };
  }
  if (roll < 0.85) {
    return {
      content: { type: 'comment', index: commentIndex as number },
      talesRemaining,
      talesServed: talesServed as number,
    };
  }
  const riddle = BARD_RIDDLES[Math.floor(drawUnit(random) * BARD_RIDDLES.length)];
  if (!riddle) throw new Error('Bard riddle registry is empty.');
  const optionOrder = riddle.options.map((_, index) => index);
  for (let index = optionOrder.length - 1; index > 0; index--) {
    const slot = Math.floor(drawUnit(random) * (index + 1));
    const left = optionOrder[index];
    const right = optionOrder[slot];
    if (left === undefined || right === undefined) throw new Error('Bard option shuffle failed.');
    optionOrder[index] = right;
    optionOrder[slot] = left;
  }
  return {
    content: { type: 'riddle', id: riddle.id, optionOrder, answer: null, awarded: false },
    talesRemaining,
    talesServed: talesServed as number,
  };
}
