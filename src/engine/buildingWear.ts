import BUILDINGS, {type BuildingDefinition} from '../data/buildings.ts';
import {SEASON_DEGRADE_MULTIPLIERS} from '../data/economy.ts';
import {getDeployedToolIds} from './forgeTools.ts';
import type {BuildingEntry} from './buildingActions.ts';
const definitions: Readonly<Record<string, BuildingDefinition>> = BUILDINGS;
/** Fittings protect against 5% of the game's already-rounded seasonal wear. */
export function getConditionAfterSeason(building: BuildingEntry, season: keyof typeof SEASON_DEGRADE_MULTIPLIERS, blacksmith: unknown): number {
 if (typeof building === 'string') return 100;
 const rate = Object.hasOwn(definitions, building.type) ? definitions[building.type]?.degradeRate ?? 5 : 5;
 const baseWear = Math.round(rate * 0.5 * (SEASON_DEGRADE_MULTIPLIERS[season] ?? 1));
 const protectedWear = getDeployedToolIds(blacksmith).has('hinges_fittings');
 const remaining = Math.max(0, (building.condition ?? 100) - baseWear * (protectedWear ? 0.95 : 1));
 // Settle protected condition to hundredths; keep old unprotected arithmetic unchanged.
 return protectedWear && baseWear > 0 ? Math.round(remaining * 100) / 100 : remaining;
}
/** Compact percentages, without rounding a legacy fractional value into a healthier tier. */
export function displayBuildingCondition(condition: number): number {
 const rounded = Number(condition.toFixed(2));
 return rounded > condition && [25, 50, 75, 100].includes(rounded) ? Number((rounded - 0.01).toFixed(2)) : rounded;
}
