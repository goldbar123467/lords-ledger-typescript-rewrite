import BUILDINGS from '../data/buildings.ts';
import type { BuildingDefinition } from '../data/buildings.ts';
import { STARTING_TOTAL_PLOTS } from '../data/economy.ts';

export interface BuildingInstance {
  instanceId: string;
  type: string;
  condition: number;
  builtOnTurn: number;
  freeUpkeep?: boolean;
}

export type BuildingEntry = BuildingInstance | string;

const buildingRegistry: Record<string, BuildingDefinition> = BUILDINGS;

export function getBuildingType(building: string | { type: string }): string {
  return typeof building === 'string' ? building : building.type;
}

export function getUsedPlots(buildings: BuildingEntry[]): number {
  return buildings.reduce((sum, entry) => sum + (buildingRegistry[getBuildingType(entry)]?.plots ?? 1), 0);
}

interface UpgradeState {
  denarii: number;
  totalPlots?: number;
  buildings: BuildingEntry[];
}

export function isBuildingIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

/** Uses durable state so replaying an action produces the same ID. */
export function nextBuildingInstanceId(
  type: string,
  turn: number,
  chronicleLength: number,
  buildings: BuildingEntry[],
): string {
  const existing = new Set(buildings.flatMap(entry => typeof entry === 'string' ? [] : [entry.instanceId]));
  let sequence = chronicleLength;
  let id = `${type}-${turn}-seq-${sequence}`;
  while (existing.has(id)) {
    sequence += 1;
    id = `${type}-${turn}-seq-${sequence}`;
  }
  return id;
}

export function getUpgradeEligibility(state: UpgradeState, index: unknown): { allowed: boolean; reason: string | null; cost: number; target: string | null } {
  if (!isBuildingIndex(index, state.buildings.length)) return { allowed: false, reason: 'Unknown building', cost: 0, target: null };
  const building = state.buildings[index];
  if (building === undefined) return { allowed: false, reason: 'Unknown building', cost: 0, target: null };
  const source = buildingRegistry[getBuildingType(building)];
  if (!source?.upgradeTo) return { allowed: false, reason: 'No upgrade available', cost: 0, target: null };
  const target = buildingRegistry[source.upgradeTo];
  if (!target) return { allowed: false, reason: 'Unknown upgrade', cost: 0, target: null };
  const cost = source.upgradeCost ?? target.cost;
  if (state.denarii < cost) return { allowed: false, reason: `Need ${cost}d (have ${state.denarii}d)`, cost, target: target.id };
  const targetCount = state.buildings.filter(entry => getBuildingType(entry) === target.id).length;
  if (targetCount >= target.maxCount) return { allowed: false, reason: `Maximum ${target.maxCount} built`, cost, target: target.id };
  const extraPlots = (target.plots ?? 1) - (source.plots ?? 1);
  if (extraPlots > 0 && getUsedPlots(state.buildings) + extraPlots > (state.totalPlots ?? STARTING_TOTAL_PLOTS)) {
    return { allowed: false, reason: `Need ${extraPlots} more plot${extraPlots === 1 ? '' : 's'}`, cost, target: target.id };
  }
  return { allowed: true, reason: null, cost, target: target.id };
}
