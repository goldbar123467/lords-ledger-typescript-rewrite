/**
 * synergyEngine.ts
 *
 * Pure functions for the V3b synergy system.
 * Checks declarative conditions from synergies.ts and computes bonuses.
 * No side effects, no I/O.
 */

import {
  SYNERGY_PATH_LIST, SYNERGY_TIER_MAP, FOOD_BUILDING_IDS,
  HIGH_FAITH_THRESHOLD, HIGH_PEOPLE_THRESHOLD,
} from "../data/synergies.ts";
import type { SynergyTierDefinition, SynergyConditions } from "../data/synergies.ts";
import { getBuildingType } from "./buildingActions.ts";

type SynergyBuilding = string | { type: string };
export interface SynergyState {
  buildings?: readonly SynergyBuilding[];
  castleLevel?: number;
  garrison?: number;
  population?: number;
  food?: number;
  tradeCount?: number;
  military?: { walls?: number; gate?: number; moat?: number };
  chapel?: { faith?: number };
  greatHall?: { meters?: { people?: number } };
  synergies?: {
    activated?: readonly string[];
    tradeTypes?: readonly string[];
    woolTrades?: number;
    spicePurchases?: number;
    lowTaxTurns?: number;
    highFaithTurns?: number;
    highPeopleTurns?: number;
    foodSurplusTurns?: number;
    revoltTriggered?: boolean;
  };
}

const foodBuildingIds: ReadonlySet<string> = new Set(FOOD_BUILDING_IDS);

/**
 * Count how many of a given building ID the player has built.
 * Handles both legacy string[] and new object[] formats.
 */
function countBuilding(buildings: readonly SynergyBuilding[], buildingId: string): number {
  return buildings.filter((b) => getBuildingType(b) === buildingId).length;
}

/**
 * Check if a single tier's conditions are met.
 * Interprets the declarative condition object against game state.
 *
 */
export function checkTierConditions(tierDef: SynergyTierDefinition, state: SynergyState): boolean {
  const c: SynergyConditions = tierDef.conditions;
  if (!c) return false;

  const buildings = state.buildings ?? [];
  const synergies = state.synergies ?? {};

  // buildings: { pasture: 2 } — requires N of each building
  if (c.buildings) {
    for (const [id, count] of Object.entries(c.buildings)) {
      if (countBuilding(buildings, id) < count) return false;
    }
  }

  // castleLevel
  if (c.castleLevel !== undefined && (state.castleLevel ?? 1) < c.castleLevel) return false;

  // garrisonMin
  if (c.garrisonMin !== undefined && (state.garrison ?? 0) < c.garrisonMin) return false;

  // populationMin
  if (c.populationMin !== undefined && (state.population ?? 0) < c.populationMin) return false;

  // foodMin
  if (c.foodMin !== undefined && (state.food ?? 0) < c.foodMin) return false;

  // tradeCount (total trades made, tracked on state.tradeCount + synergies)
  if (c.tradeCount !== undefined) {
    const total = state.tradeCount ?? 0;
    if (total < c.tradeCount) return false;
  }

  // tradeTypeCount (distinct resource types traded)
  if (c.tradeTypeCount !== undefined) {
    const types = synergies.tradeTypes ?? [];
    if (types.length < c.tradeTypeCount) return false;
  }

  // woolTrades
  if (c.woolTrades !== undefined && (synergies.woolTrades ?? 0) < c.woolTrades) return false;

  // spicePurchases
  if (c.spicePurchases !== undefined && (synergies.spicePurchases ?? 0) < c.spicePurchases) return false;

  // lowTaxTurns (consecutive turns of low or medium tax)
  if (c.lowTaxTurns !== undefined && (synergies.lowTaxTurns ?? 0) < c.lowTaxTurns) return false;

  if (c.highPeopleTurns !== undefined &&
      ((synergies.highPeopleTurns ?? 0) < c.highPeopleTurns ||
       (state.greatHall?.meters?.people ?? 0) < HIGH_PEOPLE_THRESHOLD)) return false;
  if (c.highFaithTurns !== undefined &&
      ((synergies.highFaithTurns ?? 0) < c.highFaithTurns ||
       (state.chapel?.faith ?? 0) < HIGH_FAITH_THRESHOLD)) return false;

  // foodSurplusTurns (consecutive turns with food > 100)
  if (c.foodSurplusTurns !== undefined && (synergies.foodSurplusTurns ?? 0) < c.foodSurplusTurns) return false;

  // foodBuildingCount (count of food-producing buildings)
  if (c.foodBuildingCount !== undefined) {
    const count = buildings.filter((b) => foodBuildingIds.has(getBuildingType(b))).length;
    if (count < c.foodBuildingCount) return false;
  }

  // defenseUpgradeCount — count fortification levels purchased
  if (c.defenseUpgradeCount !== undefined) {
    const mil = state.military ?? {};
    const fortLevels = (mil.walls || 0) + (mil.gate || 0) + (mil.moat || 0);
    if (fortLevels < c.defenseUpgradeCount) return false;
  }

  if (c.meterMin?.faith !== undefined &&
      (state.chapel?.faith ?? 0) < c.meterMin.faith) return false;
  if (c.meterMin?.people !== undefined &&
      (state.greatHall?.meters?.people ?? 0) < c.meterMin.people) return false;

  // noRevolts
  if (c.noRevolts && synergies.revoltTriggered) return false;

  // hasConverterBuilding (fulling_mill or brewery)
  if (c.hasConverterBuilding) {
    const hasConverter = buildings.some((b) => getBuildingType(b) === "fulling_mill" || getBuildingType(b) === "brewery");
    if (!hasConverter) return false;
  }

  return true;
}

/** Count each completed season once; a perspective flip only checks new effects afterward. */
export function advanceSynergyCounters(
  previous: NonNullable<SynergyState['synergies']>,
  observed: { taxRate: string; food: number; faith: number; peopleApproval: number },
): NonNullable<SynergyState['synergies']> {
  return {
    ...previous,
    lowTaxTurns: observed.taxRate === 'low' || observed.taxRate === 'medium'
      ? (previous.lowTaxTurns ?? 0) + 1 : 0,
    foodSurplusTurns: observed.food > 100 ? (previous.foodSurplusTurns ?? 0) + 1 : 0,
    highFaithTurns: observed.faith >= HIGH_FAITH_THRESHOLD ? (previous.highFaithTurns ?? 0) + 1 : 0,
    highPeopleTurns: observed.peopleApproval >= HIGH_PEOPLE_THRESHOLD ? (previous.highPeopleTurns ?? 0) + 1 : 0,
  };
}

/**
 * Check all synergy paths and return newly activated tier IDs.
 * Only checks the next unactivated tier for each path.
 *
 */
export function checkSynergies(state: SynergyState): string[] {
  const activated = state.synergies?.activated ?? [];
  const newlyActivated: string[] = [];

  for (const path of SYNERGY_PATH_LIST) {
    // Find the next unactivated tier for this path
    for (const tier of path.tiers) {
      if (activated.includes(tier.id)) continue;
      // This is the next tier to check
      if (checkTierConditions(tier, state)) {
        newlyActivated.push(tier.id);
      }
      break; // Only check the first unactivated tier per path
    }
  }

  return newlyActivated;
}

/**
 * Calculate total passive income from activated synergies.
 */
export function getSynergyPassiveIncome(activated: readonly string[]): number {
  let total = 0;
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.bonuses?.passiveIncome) {
      total += entry.tier.bonuses.passiveIncome;
    }
  }
  return total;
}

/**
 * Calculate total meter effects from activated synergies.
 * Returns { treasury, people, military, faith } deltas.
 */
export function getSynergyMeterEffects(activated: readonly string[]): Record<'treasury' | 'people' | 'military' | 'faith', number> {
  const effects = { treasury: 0, people: 0, military: 0, faith: 0 };
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.bonuses?.meterEffects) {
      for (const meter of ['treasury', 'people', 'military', 'faith'] as const) {
        const delta = entry.tier.bonuses.meterEffects[meter];
        if (delta !== undefined) effects[meter] += delta;
      }
    }
  }
  return effects;
}

/** Apply authored seasonal rewards to the current live approval and faith values. */
export function applySynergyMeterEffects(
  meters: { treasury: number; people: number; military: number; church: number },
  faith: number,
  activated: readonly string[],
): { meters: typeof meters; faith: number } {
  if (activated.length === 0) return { meters, faith };
  const bonuses = getSynergyMeterEffects(activated);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return {
    meters: {
      ...meters,
      treasury: clamp(meters.treasury + bonuses.treasury),
      people: clamp(meters.people + bonuses.people),
      military: clamp(meters.military + bonuses.military),
    },
    faith: clamp(faith + bonuses.faith),
  };
}

/**
 * Calculate total trade price bonus (added to sell price per unit).
 */
export function getSynergyTradePriceBonus(activated: readonly string[]): number {
  let total = 0;
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.bonuses?.tradePriceBonus) {
      total += entry.tier.bonuses.tradePriceBonus;
    }
  }
  return total;
}

/**
 * Calculate total wool sell bonus (extra denarii per wool/cloth sold).
 */
export function getSynergyWoolSellBonus(activated: readonly string[]): number {
  let total = 0;
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.bonuses?.woolSellBonus) {
      total += entry.tier.bonuses.woolSellBonus;
    }
  }
  return total;
}

/**
 * Check if any activated synergy grants population growth bonus.
 */
export function hasSynergyPopulationBonus(activated: readonly string[]): boolean {
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.bonuses?.populationGrowthBonus) return true;
  }
  return false;
}

/**
 * Get the highest-tier victory title override from activated synergies.
 * Only Tier 3 synergies have victory titles.
 * Returns the victory title object or null.
 */
export function getSynergyVictoryTitle(activated: readonly string[]): SynergyTierDefinition['victoryTitle'] | null {
  let best: SynergyTierDefinition['victoryTitle'] | null = null;
  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (entry?.tier.tier === 3 && entry.tier.victoryTitle) {
      best = entry.tier.victoryTitle;
    }
  }
  return best;
}

/**
 * Get display data for the victory screen showing all active synergies.
 * Returns array of { pathName, pathIcon, pathColor, tierLevel, tierTitle }.
 */
export function getActiveSynergyDisplay(activated: readonly string[]): Array<{
  pathName: string; pathIcon: string; pathColor: string; tierLevel: number; tierTitle: string;
}> {
  const display: Array<{ pathName: string; pathIcon: string; pathColor: string; tierLevel: number; tierTitle: string }> = [];
  const pathMaxTier: Record<string, SynergyTierDefinition> = {};

  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (!entry) continue;
    const pathId = entry.path.id;
    if (!pathMaxTier[pathId] || entry.tier.tier > pathMaxTier[pathId].tier) {
      pathMaxTier[pathId] = entry.tier;
    }
  }

  for (const [pathId, tier] of Object.entries(pathMaxTier)) {
    const path = SYNERGY_PATH_LIST.find((p) => p.id === pathId);
    if (!path) continue;
    display.push({
      pathName: path.name,
      pathIcon: path.icon,
      pathColor: path.color,
      tierLevel: tier.tier,
      tierTitle: tier.title,
    });
  }

  return display;
}

/**
 * Get set of building IDs that are contributing to active synergies.
 * Used for gold star display in EstateTab.
 */
export function getSynergyBuildings(activated: readonly string[], playerBuildings: readonly SynergyBuilding[]): Set<string> {
  const ids = new Set<string>();

  for (const id of activated) {
    const entry = SYNERGY_TIER_MAP[id];
    if (!entry) continue;
    const c = entry.tier.conditions;
    if (!c) continue;

    // Buildings explicitly named in conditions
    if (c.buildings) {
      for (const buildingId of Object.keys(c.buildings)) {
        if (playerBuildings.some((b) => getBuildingType(b) === buildingId)) {
          ids.add(buildingId);
        }
      }
    }

    // Food buildings
    if (c.foodBuildingCount) {
      for (const b of playerBuildings) {
        if (foodBuildingIds.has(getBuildingType(b))) ids.add(getBuildingType(b));
      }
    }

    // Converter buildings
    if (c.hasConverterBuilding) {
      for (const b of playerBuildings) {
        const t = getBuildingType(b);
        if (t === "fulling_mill" || t === "brewery") ids.add(t);
      }
    }
  }

  return ids;
}
