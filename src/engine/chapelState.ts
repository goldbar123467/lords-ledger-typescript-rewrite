import { MORAL_DILEMMAS, SHOP_ITEMS, type ChapelDilemma, type ChapelDilemmaId, type ChapelEffects, type ChapelItemId } from '../data/chapel.ts';
import { getManuscriptRound, isManuscriptSymbol } from './chapelManuscript.ts';
import type { ManuscriptPhase, ManuscriptRoundNumber } from './chapelManuscript.ts';

export type ChapelView = 'nave' | 'anselm' | 'caedmon' | 'manuscript' | 'dilemma';

/** Optional fields retain existing earlier-save defaults; runtime validation is separate. */
export interface ChapelViewState {
  view?: ChapelView | null;
  faith?: number | null;
  piety?: number | null;
  anselmGreeting?: string | null;
  caedmonGreeting?: string | null;
  inventory?: readonly ChapelItemId[] | null;
  titheResponse?: string | null;
  currentDilemma?: ChapelDilemma | null;
  dilemmaResult?: { text: string; effects: ChapelEffects } | null;
  dilemmasCompleted?: readonly ChapelDilemmaId[] | null;
  msPhase?: ManuscriptPhase | null;
  msPattern?: readonly number[] | null;
  msPlayerInput?: readonly number[] | null;
  msRound?: ManuscriptRoundNumber | null;
  msMaxRound?: 4 | null;
  msActiveSymbol?: number | null;
  msFact?: string | null;
  msReward?: number | null;
}

export interface ChapelSaveState extends ChapelViewState {
  faith: number;
  happiness?: number | null;
  titheAmount?: number | null;
  spicePurchasesThisYear?: number | null;
  gameLog?: readonly { text: string; turn: number; season: 'spring' | 'summer' | 'autumn' | 'winter' }[] | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function denseList(value: unknown, valid: (item: unknown) => boolean, max = Infinity): value is unknown[] {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !valid(value[index])) return false;
  }
  return true;
}
function effects(value: unknown): value is ChapelEffects {
  return record(value) && Object.entries(value).every(([key, amount]) =>
    ['denarii', 'food', 'faith', 'piety', 'happiness'].includes(key) && finite(amount));
}
function sameEffects(value: unknown, authored: ChapelEffects): boolean {
  return effects(value) && Object.keys(value).length === Object.keys(authored).length &&
    Object.entries(authored).every(([key, amount]) => Object.entries(value).some(([savedKey, savedAmount]) => savedKey === key && savedAmount === amount));
}
function dilemma(value: unknown): value is ChapelDilemma {
  if (!record(value)) return false;
  const definition = MORAL_DILEMMAS.find(item => item.id === value.id);
  if (!definition || value.title !== definition.title || typeof value.narrative !== 'string' || !value.narrative.trim()) return false;
  const choices = value.choices;
  return denseList(choices, record, definition.choices.length) && choices.length === definition.choices.length &&
    choices.every((choice, index) => {
      const expected = definition.choices[index];
      return record(choice) && expected !== undefined && choice.label === expected.label &&
        choice.iconName === expected.iconName && choice.result === expected.result && sameEffects(choice.effects, expected.effects);
    });
}

/** Check all consumed Chapel fields while retaining earlier null/missing defaults. */
export function validateChapelState(value: unknown): string | null {
  if (!record(value) || !finite(value.faith) || value.faith < 0 || value.faith > 100) return 'Save Chapel faith is invalid.';
  if (value.view != null && (typeof value.view !== 'string' || !['nave', 'anselm', 'caedmon', 'manuscript', 'dilemma'].includes(value.view))) return 'Save Chapel view is invalid.';
  for (const key of ['piety', 'happiness'] as const) {
    const meter = value[key];
    if (meter != null && (!finite(meter) || meter < 0 || meter > 100)) return `Save Chapel ${key} is invalid.`;
  }
  for (const key of ['anselmGreeting', 'caedmonGreeting', 'titheResponse'] as const) {
    if (value[key] != null && typeof value[key] !== 'string') return `Save Chapel ${key} is invalid.`;
  }
  if (value.titheAmount != null && (!finite(value.titheAmount) || value.titheAmount < 0)) return 'Save Chapel tithe amount is invalid.';
  const count = value.spicePurchasesThisYear;
  if (count != null && (!finite(count) || !Number.isSafeInteger(count) || count < 0)) return 'Save Chapel spice counter is invalid.';
  for (const key of ['inventory', 'dilemmasCompleted'] as const) {
    const ids = value[key];
    const definitions = key === 'inventory' ? SHOP_ITEMS : MORAL_DILEMMAS;
    if (ids != null && (!denseList(ids, id => definitions.some(item => item.id === id), definitions.length) || new Set(ids).size !== ids.length)) {
      return `Save Chapel ${key} is invalid.`;
    }
  }
  if (value.gameLog != null && !denseList(value.gameLog, entry => record(entry) &&
    typeof entry.text === 'string' && finite(entry.turn) && Number.isSafeInteger(entry.turn) && entry.turn >= 0 &&
    typeof entry.season === 'string' && ['spring', 'summer', 'autumn', 'winter'].includes(entry.season))) return 'Save Chapel log is invalid.';
  const current = value.currentDilemma;
  if (current != null && !dilemma(current)) return 'Save Chapel dilemma is invalid.';
  if (value.view === 'dilemma' && current == null) return 'Save Chapel is missing its pending dilemma.';
  const result = value.dilemmaResult;
  if (result != null && (!record(result) || !dilemma(current) ||
    !current.choices.some(choice => result.text === choice.result && sameEffects(result.effects, choice.effects)) ||
    !Array.isArray(value.dilemmasCompleted) || !value.dilemmasCompleted.includes(current.id))) return 'Save Chapel dilemma result is invalid.';
  if (dilemma(current) && result == null && Array.isArray(value.dilemmasCompleted) && value.dilemmasCompleted.includes(current.id)) {
    return 'Save Chapel pending dilemma was already completed.';
  }
  return validateManuscriptState(value);
}

function validateManuscriptState(value: Record<string, unknown>): string | null {
  const phase = value.msPhase ?? 'idle';
  const round = value.msRound ?? 1;
  const max = value.msMaxRound ?? 4;
  const pattern = value.msPattern ?? [];
  const input = value.msPlayerInput ?? [];
  const invalid = 'Save manuscript sequence is damaged. You can restart only this copying attempt.';
  if (phase !== 'idle' && phase !== 'showing' && phase !== 'input' && phase !== 'success' && phase !== 'fail') return invalid;
  if (round !== 1 && round !== 2 && round !== 3 && round !== 4) return invalid;
  if (max !== 4 || !denseList(pattern, isManuscriptSymbol, 6) || !denseList(input, isManuscriptSymbol, 6)) return invalid;
  if (value.msActiveSymbol != null && !isManuscriptSymbol(value.msActiveSymbol)) return invalid;
  if (value.msFact != null && typeof value.msFact !== 'string') return invalid;
  if (value.msReward != null && value.msReward !== 0 && value.msReward !== 15 && value.msReward !== 20) return invalid;
  if (phase === 'idle') return pattern.length === 0 && input.length === 0 && (value.msReward ?? 0) === 0 ? null : invalid;
  if (phase === 'showing' || phase === 'input') {
    return (value.msReward ?? 0) === 0 && getManuscriptRound({ msPhase: phase, msRound: round,
      msMaxRound: max, msPattern: pattern, msPlayerInput: input }) ? null : invalid;
  }
  if (pattern.length !== round + 2) return invalid;
  if (phase === 'success') return round === 4 && input.length === pattern.length &&
    input.every((symbol, index) => symbol === pattern[index]) &&
    (value.msReward == null || value.msReward === 15 || value.msReward === 20) ? null : invalid;
  const last = input.length - 1;
  return input.length > 0 && input.length <= pattern.length && (value.msReward ?? 0) === 0 &&
    input.every((symbol, index) => index === last ? symbol !== pattern[index] : symbol === pattern[index]) ? null : invalid;
}

/** Recovery resets only the failed copying attempt; the caller revalidates the entire snapshot. */
export function restartSavedManuscript(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !record(value.chapel)) return null;
  return { ...value, chapel: { ...value.chapel, view: 'nave', msPhase: 'idle', msRound: 1, msMaxRound: 4,
    msPattern: [], msPlayerInput: [], msActiveSymbol: null, msFact: null, msReward: 0 } };
}

export type ChapelAction =
  | { type: 'CHAPEL_SET_VIEW'; payload: { view: ChapelView } }
  | { type: 'CHAPEL_PAY_TITHE'; payload: { amount: number } }
  | { type: 'CHAPEL_BUY_ITEM'; payload: { itemId: ChapelItemId } }
  | { type: 'CHAPEL_RESOLVE_DILEMMA'; payload: { choiceIndex: number } }
  | { type: 'CHAPEL_MS_FLASH' | 'CHAPEL_MS_INPUT'; payload: { index: number } }
  | { type: 'CHAPEL_START_DILEMMA' | 'CHAPEL_MS_START' | 'CHAPEL_MS_CLEAR_FLASH' | 'CHAPEL_MS_DONE_SHOWING' };
