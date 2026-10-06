import {getDeployedToolIds, isWorkingTool, getToolDescription} from './forgeTools.ts';
import {FORGEABLE_ITEMS} from '../data/blacksmith.ts';
import {FOOD_RESOURCES} from '../data/economy.ts';
export interface AgricultureBonuses {readonly food: number; readonly harvest: number}
export function getAgriculturalTool(id: unknown) {return id === 'plowshare' || id === 'scythe' ? FORGEABLE_ITEMS[id] : null;}
export function isWorkingAgriculturalTool(value: unknown): boolean {return isWorkingTool(value) && Boolean(getAgriculturalTool(value.itemId));}
export function getAgricultureBonuses(blacksmith: unknown): AgricultureBonuses {
 const ids = getDeployedToolIds(blacksmith);
 return {food: ids.has('plowshare') ? 0.05 : 0, harvest: ids.has('scythe') ? 0.05 : 0};
}
export function getAgricultureMultiplier(resource: string, farm: boolean, bonuses: AgricultureBonuses): number {
 const food = FOOD_RESOURCES.some(id => id === resource) ? bonuses.food : 0;
 return 1 + food + (farm && resource === 'grain' ? bonuses.harvest : 0);
}

export function getAgricultureDescription(id: unknown): string {
 return getAgriculturalTool(id) ? getToolDescription(id) : '';
}
