import { MANUSCRIPT_SYMBOLS } from '../data/chapel.ts';

export type ManuscriptPhase = 'idle' | 'showing' | 'input' | 'success' | 'fail';
export type ManuscriptRoundNumber = 1 | 2 | 3 | 4;
export interface ManuscriptRound {
  round: ManuscriptRoundNumber;
  pattern: readonly number[];
  input: readonly number[];
}

export function isManuscriptSymbol(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MANUSCRIPT_SYMBOLS.length;
}

function isSymbolSequence(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isManuscriptSymbol(value[index])) return false;
  }
  return true;
}

/** Validate the active sequence and correct prefix before timer/input commands mutate it. */
export function getManuscriptRound(chapel: {
  msPhase?: unknown; msRound?: unknown; msMaxRound?: unknown;
  msPattern?: unknown; msPlayerInput?: unknown;
}): ManuscriptRound | null {
  const round = chapel.msRound ?? 1;
  const pattern = chapel.msPattern;
  const input = chapel.msPlayerInput ?? [];
  if (round !== 1 && round !== 2 && round !== 3 && round !== 4) return null;
  if ((chapel.msMaxRound ?? 4) !== 4) return null;
  if (!Array.isArray(pattern) || pattern.length !== round + 2 || !isSymbolSequence(pattern)) return null;
  if (!Array.isArray(input) || input.length >= pattern.length || !isSymbolSequence(input)) return null;
  if (chapel.msPhase === 'showing' && input.length !== 0) return null;
  if (!input.every((symbol, index) => symbol === pattern[index])) return null;
  return { round, pattern, input };
}
