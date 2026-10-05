import { MANUSCRIPT_SYMBOLS, MANUSCRIPT_FACTS } from '../data/chapel.ts';

export type ManuscriptPhase = 'idle' | 'showing' | 'input' | 'success' | 'fail';
export type ManuscriptRoundNumber = 1 | 2 | 3 | 4;
export interface ManuscriptRound {
  round: ManuscriptRoundNumber;
  pattern: readonly number[];
  input: readonly number[];
}

export type ManuscriptCommand = 'CHAPEL_MS_START' | 'CHAPEL_MS_FLASH' |
  'CHAPEL_MS_CLEAR_FLASH' | 'CHAPEL_MS_DONE_SHOWING' | 'CHAPEL_MS_INPUT';

/** Sequence fields remain unknown until checked, including earlier partial saves. */
export interface ManuscriptChapel {
  view?: string;
  msPhase?: unknown;
  msRound?: unknown;
  msMaxRound?: unknown;
  msPattern?: unknown;
  msPlayerInput?: unknown;
  inventory?: readonly string[] | null;
  faith?: number | null;
  piety?: number | null;
}

interface ManuscriptChange {
  chapel: {
    view?: 'manuscript';
    msPhase?: ManuscriptPhase;
    msRound?: ManuscriptRoundNumber;
    msMaxRound?: 4;
    msPattern?: number[];
    msPlayerInput?: number[];
    msActiveSymbol?: number | null;
    msFact?: string | null;
    msReward?: number;
    faith?: number;
    piety?: number;
  };
  denarii?: number;
  logText?: string;
  chronicleText?: string;
}

/** Plan only manuscript changes; caller retains unrelated Chapel fields and timestamps. */
export function planManuscriptAction(
  state: { phase: string; denarii: number; chapel?: ManuscriptChapel | null },
  type: ManuscriptCommand, payload: unknown, random: () => number,
): ManuscriptChange | null {
  if (state.phase !== 'management') return null;
  const chapel = state.chapel ?? {};
  const pattern = (length: number) => Array.from({ length }, () => Math.floor(random() * MANUSCRIPT_SYMBOLS.length));
  if (type === 'CHAPEL_MS_START') return { chapel: {
    view: 'manuscript', msPhase: 'showing', msPattern: pattern(3), msPlayerInput: [],
    msRound: 1, msMaxRound: 4, msActiveSymbol: null, msFact: null, msReward: 0,
  } };
  if (chapel.view !== 'manuscript') return null;
  const inputCommand = type === 'CHAPEL_MS_INPUT';
  if (chapel.msPhase !== (inputCommand ? 'input' : 'showing')) return null;
  const round = getManuscriptRound(chapel);
  if (!round) return null;
  if (type === 'CHAPEL_MS_CLEAR_FLASH') return { chapel: { msActiveSymbol: null } };
  if (type === 'CHAPEL_MS_DONE_SHOWING') return { chapel: { msPhase: 'input' } };
  const index = typeof payload === 'object' && payload !== null && 'index' in payload ? payload.index : undefined;
  if (!isManuscriptSymbol(index)) return null;
  if (type === 'CHAPEL_MS_FLASH') return { chapel: { msActiveSymbol: index } };
  const msPlayerInput = [...round.input, index];
  // The injected seeded generator returns [0, 1); the authored facts are nonempty.
  const fact = () => MANUSCRIPT_FACTS[Math.floor(random() * MANUSCRIPT_FACTS.length)];
  if (index !== round.pattern[round.input.length]) return { chapel: { msPhase: 'fail', msPlayerInput, msFact: fact() } };
  if (msPlayerInput.length < round.pattern.length) return { chapel: { msPlayerInput } };
  if (round.round < 4) {
    const nextRound = round.round === 1 ? 2 : round.round === 2 ? 3 : 4;
    return { chapel: { msRound: nextRound, msPattern: pattern(3 + round.round), msPlayerInput: [], msPhase: 'showing', msActiveSymbol: null } };
  }
  const reward = (chapel.inventory ?? []).includes('quill_ink') ? 20 : 15;
  return {
    denarii: state.denarii + reward,
    chapel: { msPhase: 'success', msPlayerInput, msReward: reward, msFact: fact(),
      faith: Math.min(100, (chapel.faith ?? 50) + 5), piety: Math.min(100, (chapel.piety ?? 30) + 3) },
    logText: `Completed manuscript copying: +${reward}d, +5 Faith, +3 Piety.`,
    chronicleText: `Completed manuscript in the Scriptorium. Earned ${reward}d.`,
  };
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
