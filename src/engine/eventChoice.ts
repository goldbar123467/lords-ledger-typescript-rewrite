import { translateEffects, applyResourceEffects, checkGameOver, type AuthoredEffects } from './meterUtils.ts';
import { addChronicle, type ChronicleKind, type SavedChronicleEntry } from './chronicle.ts';
import { MAX_GARRISON, type Inventory } from '../data/economy.ts';
import { removeFromGarrison, type MilitaryDefenseState } from '../data/military.ts';
import type { CauseChainEntry, ResourceDeltas } from './initialGameStateTypes.ts';
import type { Season } from '../save/saveGame.ts';

/** Historical optional wording uses the same fallback order as authored events. */
export interface ChoiceOption {
  readonly effects?: AuthoredEffects | null;
  readonly text?: string; readonly chronicle?: string; readonly resultText?: string;
  readonly causeChainSummary?: string | null; readonly scribesNote?: string | null;
}
export interface ChoiceEvent {
  readonly id: string; readonly title?: string;
  readonly options?: readonly ChoiceOption[];
  readonly effects?: AuthoredEffects | null; readonly scribesNote?: string | null;
}
export interface ChoiceState<M extends MilitaryDefenseState = MilitaryDefenseState> extends Readonly<ResourceDeltas> {
  readonly inventory: Inventory; readonly military?: M;
  readonly chronicle: readonly SavedChronicleEntry[]; readonly causeChain: readonly CauseChainEntry[];
  readonly turn: number; readonly season: Season; readonly year: number;
  readonly difficulty: string; readonly bankruptcyTurns?: number; readonly starvationTurns?: number;
}
const MAX_CAUSE_CHAIN = 4;

function addCauseChain(causeChain: readonly CauseChainEntry[], turn: number, season: Season, year: number, summary: string) {
  const entry = { turn, season, year, summary };
  const next = [...causeChain, entry];
  return next.slice(-MAX_CAUSE_CHAIN);
}

export function computeResourceDeltas(before: Readonly<ResourceDeltas>, after: Readonly<ResourceDeltas>): ResourceDeltas {
  return {
    denarii: after.denarii - before.denarii,
    food: after.food - before.food,
    population: after.population - before.population,
    garrison: after.garrison - before.garrison,
  };
}

function getOptionEffects(event: ChoiceEvent, optionIndex: number) {
  const option = event.options?.[optionIndex];
  if (!option) return {};
  if (option.effects) return option.effects;
  return event.effects ?? {};
}

function getScribesNote(event: ChoiceEvent, optionIndex: number) {
  const option = event.options?.[optionIndex];
  return option?.scribesNote ?? event.scribesNote ?? null;
}

function buildCauseChainSummary(event: ChoiceEvent, optionIndex: number) {
  const option = event.options?.[optionIndex];
  if (option?.causeChainSummary) return option.causeChainSummary;
  if (option?.text) return option.text.slice(0, 80);
  if (event.title) return event.title.slice(0, 80);
  return `Turn choice at event ${event.id}`;
}

/** Translate effects, reconcile the roster, record history and check ending priority. */
export function resolveEventChoice<M extends MilitaryDefenseState>(state: ChoiceState<M>, event: ChoiceEvent, optionIndex: number, chronicleType: ChronicleKind) {
  const { chronicle, causeChain, turn, season, year } = state;

  const effects = getOptionEffects(event, optionIndex);
  const resourceEffects = translateEffects(effects);
  const applied = applyResourceEffects(state, resourceEffects, MAX_GARRISON);
  const scribesNote = getScribesNote(event, optionIndex);

  const option = event.options?.[optionIndex];
  const chronicleText = option?.chronicle ?? option?.resultText ?? option?.text ?? event.title ?? "A decision was made.";

  const newChronicle = addChronicle(chronicle, chronicleText, season, year, turn, chronicleType);

  const summary = buildCauseChainSummary(event, optionIndex);
  const newCauseChain = addCauseChain(causeChain, turn, season, year, summary);

  // Reconcile typed garrison with flat garrison changes from events
  const garrisonDelta = applied.garrison - state.garrison;
  let updatedMilitary = applied.military || state.military;
  if (garrisonDelta !== 0 && updatedMilitary) {
    const milGarrison = { ...updatedMilitary.garrison };
    if (garrisonDelta > 0) {
      // Event adds soldiers — add as levy
      milGarrison.levy = (milGarrison.levy || 0) + garrisonDelta;
    } else {
      // Event removes soldiers — remove weakest first
      updatedMilitary = { ...updatedMilitary, garrison: removeFromGarrison(milGarrison, Math.abs(garrisonDelta)) };
    }
    if (garrisonDelta > 0) {
      updatedMilitary = { ...updatedMilitary, garrison: milGarrison };
    }
  }

  const newState = {
    ...state,
    denarii: applied.denarii,
    population: applied.population,
    garrison: applied.garrison,
    inventory: applied.inventory,
    food: applied.food,
    military: updatedMilitary,
  };
  const gameOverReason = checkGameOver(newState);

  const resourceDeltas = computeResourceDeltas(state, applied);

  return {
    denarii: applied.denarii,
    population: applied.population,
    garrison: applied.garrison,
    inventory: applied.inventory,
    food: applied.food,
    military: updatedMilitary,
    resourceDeltas,
    chronicle: newChronicle,
    causeChain: newCauseChain,
    scribesNote,
    gameOverReason,
  };
}
