import type { ChapelDilemma, ChapelDilemmaId, ChapelEffects, ChapelItemId } from '../data/chapel.ts';
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

export type ChapelAction =
  | { type: 'CHAPEL_SET_VIEW'; payload: { view: ChapelView } }
  | { type: 'CHAPEL_PAY_TITHE'; payload: { amount: number } }
  | { type: 'CHAPEL_BUY_ITEM'; payload: { itemId: ChapelItemId } }
  | { type: 'CHAPEL_RESOLVE_DILEMMA'; payload: { choiceIndex: number } }
  | { type: 'CHAPEL_MS_FLASH' | 'CHAPEL_MS_INPUT'; payload: { index: number } }
  | { type: 'CHAPEL_START_DILEMMA' | 'CHAPEL_MS_START' | 'CHAPEL_MS_CLEAR_FLASH' | 'CHAPEL_MS_DONE_SHOWING' };
