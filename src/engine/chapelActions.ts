import { ANSELM_GREETINGS, CAEDMON_GREETINGS, MORAL_DILEMMAS, SHOP_ITEMS, TITHE_EFFECTS, TITHE_RESPONSES } from '../data/chapel.ts';
import type { ChapelEffects, ChapelItemId } from '../data/chapel.ts';
import type { Inventory } from '../data/economy.ts';
import type { ChapelAction, ChapelSaveState, ChapelView } from './chapelState.ts';
import { canAffordChapelChoice, getChapelChoice } from './chapelChoices.ts';
import { getTotalFood } from './economyEngine.ts';
import { planManuscriptAction } from './chapelManuscript.ts';
import type { ManuscriptChapel } from './chapelManuscript.ts';
import { isPositivePrice } from './transactionValidation.ts';

interface ChapelCommandState {
  phase: string;
  denarii: number;
  food: number;
  inventory: Inventory;
  churchDonation?: number | null;
  chapel?: (ManuscriptChapel & {
    inventory?: readonly ChapelItemId[] | null;
    happiness?: number | null;
    anselmGreeting?: string | null;
    caedmonGreeting?: string | null;
    currentDilemma?: { id: string; title: string } | null;
    dilemmaResult?: unknown;
    dilemmasCompleted?: ChapelSaveState['dilemmasCompleted'];
  }) | null;
}
interface ChapelChange {
  chapel: Partial<ChapelSaveState>;
  denarii?: number;
  food?: number;
  inventory?: Inventory;
  churchDonation?: number;
  logText?: string;
  chronicleText?: string;
  chronicleKind?: 'action' | 'event';
}
function isView(value: unknown): value is ChapelView {
  return value === 'nave' || value === 'anselm' || value === 'caedmon' || value === 'manuscript' || value === 'dilemma';
}
function pick<T>(values: readonly T[], random: () => number): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new RangeError('Chapel selection requires a nonempty pool and a draw in [0, 1).');
  return value;
}
function meter(value: number | null | undefined, fallback: number, change = 0): number {
  return Math.min(100, Math.max(0, (value ?? fallback) + change));
}
function effectSummary(effects: ChapelEffects): string {
  const parts: string[] = [];
  if (effects.denarii) parts.push(`${effects.denarii > 0 ? '+' : ''}${effects.denarii}d`);
  for (const [key, name] of [['faith', 'Faith'], ['piety', 'Piety'], ['happiness', 'Happiness']] as const) {
    const value = effects[key];
    if (value) parts.push(`${name} ${value > 0 ? '+' : ''}${value}`);
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** Pure Chapel plans; the reducer owns timestamps, log append and chronicle append. */
export function planChapelAction(state: ChapelCommandState, type: ChapelAction['type'], payload: unknown, random: () => number): ChapelChange | null {
  if (state.phase !== 'management') return null;
  return planCommand(state, type, payload, random);
}

function planCommand(state: ChapelCommandState, type: ChapelAction['type'], payload: unknown, random: () => number): ChapelChange | null {
  switch (type) {
    case 'CHAPEL_MS_START': case 'CHAPEL_MS_FLASH': case 'CHAPEL_MS_CLEAR_FLASH':
    case 'CHAPEL_MS_DONE_SHOWING': case 'CHAPEL_MS_INPUT':
      return planManuscriptAction(state, type, payload, random);
  }
  const chapel = state.chapel ?? {};
  const fields = typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? payload : {};
  if (type === 'CHAPEL_SET_VIEW') {
    const view = 'view' in fields ? fields.view : undefined;
    if (!isView(view) || (view === 'dilemma' && !MORAL_DILEMMAS.some(dilemma => dilemma.id === chapel.currentDilemma?.id))) return null;
    const patch: Partial<ChapelSaveState> = { view };
    if (view === 'anselm' && !chapel.anselmGreeting) patch.anselmGreeting = pick(ANSELM_GREETINGS, random);
    if (view === 'caedmon' && !chapel.caedmonGreeting) patch.caedmonGreeting = pick(CAEDMON_GREETINGS, random);
    if (view === 'nave') Object.assign(patch, { titheResponse: null, dilemmaResult: null, currentDilemma: null });
    return { chapel: patch };
  }
  if (type === 'CHAPEL_PAY_TITHE') {
    const amount = 'amount' in fields ? fields.amount : undefined;
    if (!isPositivePrice(amount) || !Number.isFinite(state.denarii) || state.denarii < amount) return null;
    const churchDonation = (state.churchDonation ?? 0) + amount;
    if (!Number.isFinite(churchDonation)) return null;
    const ratio = amount / state.denarii;
    const category = ratio >= .10 ? 'generous' : ratio >= .03 ? 'stingy' : 'none';
    const response = pick(TITHE_RESPONSES[category], random);
    const effects = TITHE_EFFECTS[category];
    return {
      denarii: state.denarii - amount, churchDonation,
      chapel: { faith: meter(chapel.faith, 50, effects.faith), piety: meter(chapel.piety, 30, effects.piety), titheResponse: response },
      logText: `Tithed ${amount}d to Father Anselm (${category}).`,
      chronicleText: `Tithed ${amount}d to the Chapel. Faith ${effects.faith >= 0 ? '+' : ''}${effects.faith}, Piety ${effects.piety >= 0 ? '+' : ''}${effects.piety}.`,
    };
  }
  if (type === 'CHAPEL_BUY_ITEM') {
    const itemId = 'itemId' in fields ? fields.itemId : undefined;
    const item = SHOP_ITEMS.find(candidate => candidate.id === itemId);
    const owned = chapel.inventory ?? [];
    if (!item || owned.includes(item.id) || state.denarii < item.cost) return null;
    const effects = item.effects;
    const inventory = effects.food ? { ...state.inventory, grain: (state.inventory.grain || 0) + effects.food } : state.inventory;
    return {
      denarii: state.denarii - item.cost, inventory, food: effects.food ? getTotalFood(inventory) : state.food,
      chapel: { inventory: [...owned, item.id], faith: meter(chapel.faith, 50, effects.faith),
        piety: meter(chapel.piety, 30, effects.piety), happiness: meter(chapel.happiness, 60, effects.happiness) },
      logText: `Purchased ${item.name} for ${item.cost}d from Brother Caedmon.`,
      chronicleText: `Purchased ${item.name} from Brother Caedmon for ${item.cost}d.`,
    };
  }
  if (type === 'CHAPEL_START_DILEMMA') {
    const available = MORAL_DILEMMAS.filter(dilemma => !(chapel.dilemmasCompleted ?? []).includes(dilemma.id));
    return available.length ? { chapel: { view: 'dilemma', currentDilemma: pick(available, random), dilemmaResult: null } } : null;
  }
  if (type !== 'CHAPEL_RESOLVE_DILEMMA') return null;
  const dilemma = chapel.currentDilemma;
  const definition = MORAL_DILEMMAS.find(candidate => candidate.id === dilemma?.id);
  if (!dilemma || !definition || chapel.dilemmaResult || (chapel.dilemmasCompleted ?? []).includes(definition.id)) return null;
  const index = 'choiceIndex' in fields ? fields.choiceIndex : undefined;
  const choice = getChapelChoice(definition.id, index);
  if (!choice || !canAffordChapelChoice(choice, state.denarii)) return null;
  const effects = choice.effects;
  return {
    denarii: Math.max(0, state.denarii + (effects.denarii ?? 0)),
    chapel: { faith: meter(chapel.faith, 50, effects.faith), piety: meter(chapel.piety, 30, effects.piety),
      happiness: meter(chapel.happiness, 60, effects.happiness), dilemmaResult: { text: choice.result, effects },
      dilemmasCompleted: [...(chapel.dilemmasCompleted ?? []), definition.id] },
    logText: `Moral dilemma "${dilemma.title}" — chose: ${choice.label}`,
    chronicleText: `Chapel dilemma: "${dilemma.title}" — ${choice.label}.${effectSummary(effects)}`,
    chronicleKind: 'event',
  };
}
