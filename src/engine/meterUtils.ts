/** Pure translations from authored legacy meters to the resource simulation. */
import { BANKRUPTCY_SEASONS, famineSeasonsForDifficulty } from "./endConditions.ts";
import { getTotalFood } from './economyEngine.ts';
import type { Inventory } from '../data/economy.ts';

type LegacyMeter = 'treasury' | 'people' | 'military' | 'faith';
type ResourceMeter = 'denarii' | 'food' | 'population' | 'garrison';
export type ResourceEffects = Record<ResourceMeter, number> & { morale?: number };
export type AuthoredEffects = Partial<Record<LegacyMeter | ResourceMeter | 'morale', number>>;
export type EffectDirection = 'up' | 'down';
export type AuthoredIndicators = Partial<Record<LegacyMeter | ResourceMeter, EffectDirection>>;
export type ResourceIndicators = Partial<Record<ResourceMeter, EffectDirection>>;

interface MilitaryMorale { morale?: number }
interface ResourceState<M extends object> {
  denarii: number;
  population: number;
  garrison: number;
  inventory: Inventory;
  military?: M & MilitaryMorale;
}

interface EndConditionState {
  population: number;
  bankruptcyTurns?: number;
  starvationTurns?: number;
  difficulty: string;
}
export interface GameOverReason {
  type: 'depopulation' | 'bankruptcy' | 'famine';
  reason: string;
}

/**
 * Numeric direct effects add to translated legacy effects. For example,
 * treasury 5 plus faith -1 gives 45 denarii; military 2 gives 1 soldier and 6 morale.
 * Absent input retains the legacy four-zero shape, without a morale property.
 */
export function translateEffects(effects?: AuthoredEffects | null): ResourceEffects {
  if (!effects) return { denarii: 0, food: 0, population: 0, garrison: 0 };

  const result = { denarii: 0, food: 0, population: 0, garrison: 0, morale: 0 };

  // Translate old meter keys to resource effects
  if (effects.treasury) result.denarii += effects.treasury * 10;
  if (effects.people) result.food += effects.people * 3;
  if (effects.military) {
    result.garrison += effects.military > 0 ? Math.ceil(effects.military / 5) : Math.floor(effects.military / 5);
    // Military events also affect garrison morale
    result.morale += effects.military * 3;
  }
  if (effects.faith) result.denarii += effects.faith * 5;

  // Direct resource keys stack with the legacy conversion.
  if (effects.denarii) result.denarii += effects.denarii;
  if (effects.food) result.food += effects.food;
  if (effects.population) result.population += effects.population;
  if (effects.garrison) result.garrison += effects.garrison;
  if (effects.morale) result.morale += effects.morale;

  return result;
}

/**
 * Applies translated resource effects to the game state.
 * Food effects are added to grain in inventory.
 * Population and garrison are clamped to valid ranges.
 */
export function applyResourceEffects<M extends object = MilitaryMorale>(
  state: ResourceState<M>, resourceEffects: ResourceEffects, maxGarrison = 25,
) {
  const newDenarii = Math.max(0, state.denarii + resourceEffects.denarii);
  const newPopulation = Math.max(0, state.population + resourceEffects.population);
  const popBasedCap = Math.floor(newPopulation * 0.6);
  const newGarrison = Math.max(0, Math.min(maxGarrison, popBasedCap, state.garrison + resourceEffects.garrison));

  // Food effects go into grain
  let newInventory = state.inventory;
  if (resourceEffects.food !== 0) {
    const currentGrain = state.inventory.grain || 0;
    const newGrain = Math.max(0, currentGrain + resourceEffects.food);
    newInventory = { ...state.inventory, grain: newGrain };
  }

  // Recalculate total food from inventory
  const newFood = getTotalFood(newInventory);

  // Apply morale changes to military state
  let newMilitary: (Omit<M, 'morale'> & MilitaryMorale) | undefined = state.military;
  if (resourceEffects.morale && newMilitary) {
    const currentMorale = newMilitary.morale ?? 50;
    const newMorale = Math.max(0, Math.min(100, currentMorale + resourceEffects.morale));
    newMilitary = { ...newMilitary, morale: newMorale };
  }

  return {
    denarii: newDenarii,
    population: newPopulation,
    garrison: newGarrison,
    inventory: newInventory,
    food: newFood,
    military: newMilitary,
  };
}

/**
 * Preserve ending priority: depopulation, six bankrupt seasons, then famine.
 */
export function checkGameOver(state: EndConditionState): GameOverReason | null {
  if (state.population <= 0) {
    return {
      type: "depopulation",
      reason: "All your families have abandoned or perished on your estate.",
    };
  }
  if ((state.bankruptcyTurns || 0) >= BANKRUPTCY_SEASONS) {
    return {
      type: "bankruptcy",
      reason: "Your creditors have seized the estate after seasons of empty coffers.",
    };
  }
  const famineThreshold = famineSeasonsForDifficulty(state.difficulty);
  if ((state.starvationTurns || 0) >= famineThreshold) {
    return {
      type: "famine",
      reason: "After seasons of famine, your people have scattered to seek sustenance elsewhere.",
    };
  }
  return null;
}

/**
 * Translate qualitative EventCard labels. Direct resource labels replace legacy
 * labels; treasury takes priority over faith when both feed the denarii label.
 */
export function translateIndicators(indicators?: AuthoredIndicators | null): ResourceIndicators | null {
  if (!indicators) return null;

  const result: ResourceIndicators = {};
  if (indicators.treasury) result.denarii = indicators.treasury;
  if (indicators.people) result.food = indicators.people;
  if (indicators.military) result.garrison = indicators.military;
  if (indicators.faith) result.denarii = result.denarii || indicators.faith;

  // Pass through direct resource indicators
  if (indicators.denarii) result.denarii = indicators.denarii;
  if (indicators.food) result.food = indicators.food;
  if (indicators.population) result.population = indicators.population;
  if (indicators.garrison) result.garrison = indicators.garrison;

  return Object.keys(result).length > 0 ? result : null;
}
