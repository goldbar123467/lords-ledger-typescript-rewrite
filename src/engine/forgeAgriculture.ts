import {FORGEABLE_ITEMS} from '../data/blacksmith.ts';
import {FOOD_RESOURCES} from '../data/economy.ts';
export interface AgricultureBonuses {readonly food: number; readonly harvest: number}
function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
export function getAgriculturalTool(id: unknown) {
 return id === 'plowshare' || id === 'scythe' ? FORGEABLE_ITEMS[id] : null;
}
/** Fixed authored 5% rates; grade still controls sale value. Broken tools provide no utility. */
export function isWorkingAgriculturalTool(value: unknown): boolean {
 if (!record(value) || value.category !== 'tool' || !getAgriculturalTool(value.itemId) || typeof value.grade !== 'string' || value.grade === 'Scrap') return false;
 const quality = value.qualityScore ?? 50;
 return typeof value.uid === 'number' && Number.isSafeInteger(value.uid) && value.uid > 0 &&
  typeof quality === 'number' && Number.isFinite(quality) && quality >= 30 && quality <= 100;
}
/** One working deployed tool per authored type applies; inventory holdings grant no effect. */
export function getAgricultureBonuses(blacksmith: unknown): AgricultureBonuses {
 if (!record(blacksmith) || !Array.isArray(blacksmith.equipped)) return {food: 0, harvest: 0};
 let food = 0, harvest = 0;
 for (const item of blacksmith.equipped) {
  if (!isWorkingAgriculturalTool(item) || !record(item)) continue;
  if (item.itemId === 'plowshare') food = 0.05;
  if (item.itemId === 'scythe') harvest = 0.05;
 }
 return {food, harvest};
}
export function getAgricultureMultiplier(resource: string, farm: boolean, bonuses: AgricultureBonuses): number {
 const food = FOOD_RESOURCES.some(id => id === resource) ? bonuses.food : 0;
 return 1 + food + (farm && resource === 'grain' ? bonuses.harvest : 0);
}

export function getAgricultureDescription(id: unknown): string {
 return id === 'plowshare' ? 'Food production +5%, including garden grain.' : id === 'scythe' ? 'Farm grain output +5% per season.' : '';
}
