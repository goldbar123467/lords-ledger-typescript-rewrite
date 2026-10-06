import {FORGEABLE_ITEMS} from '../data/blacksmith.ts';
export type DeployableToolId = 'plowshare' | 'scythe' | 'nails' | 'hinges_fittings' | 'church_bell' | 'lock_key';
interface WorkingTool {readonly uid: number; readonly itemId: DeployableToolId; readonly category: 'tool'; readonly grade: string; readonly qualityScore?: number | null}
function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
export function getDeployableTool(id: unknown) {
 return id === 'plowshare' || id === 'scythe' || id === 'nails' || id === 'hinges_fittings' || id === 'church_bell' || id === 'lock_key' ? FORGEABLE_ITEMS[id] : null;
}
/** Only known working tools grant their fixed authored utility. Preserve original owned records. */
export function isWorkingTool(value: unknown): value is WorkingTool {
 if (!record(value) || value.category !== 'tool' || !getDeployableTool(value.itemId) || typeof value.grade !== 'string' || value.grade === 'Scrap') return false;
 const quality = value.qualityScore ?? 50;
 return typeof value.uid === 'number' && Number.isSafeInteger(value.uid) && value.uid > 0 &&
  typeof quality === 'number' && Number.isFinite(quality) && quality >= 30 && quality <= 100;
}
/** Inventory grants no utility; deployed duplicate types do not stack. */
export function getDeployedToolIds(blacksmith: unknown): ReadonlySet<DeployableToolId> {
 const ids = new Set<DeployableToolId>();
 if (record(blacksmith) && Array.isArray(blacksmith.equipped)) for (const item of blacksmith.equipped) if (isWorkingTool(item)) ids.add(item.itemId);
 return ids;
}
export function getToolDescription(id: unknown): string {
 return id === 'plowshare' ? 'Food production +5%, including garden grain.' : id === 'scythe' ? 'Farm grain output +5% per season.' : id === 'nails' ? 'Estate building and upgrade costs -5%, rounded up to whole denarii.' : id === 'hinges_fittings' ? 'Seasonal building wear -5%.' : id === 'church_bell' ? 'Chapel Faith +8 on first working bell deployment, capped at 100.' : id === 'lock_key' ? 'Raid coin losses -5%, rounded up to whole denarii.' : '';
}
/** Construction prices remain whole denarii; round up so the discount never exceeds 5%. */
export function getConstructionCost(baseCost: number, blacksmith: unknown): number {
 return getDeployedToolIds(blacksmith).has('nails') ? Math.ceil(baseCost * 0.95) : baseCost;
}

export function getToolDeploymentDescription(id: unknown): string {
 const description = getToolDescription(id);
 if (id === 'church_bell') return description + ' Additional bells give no extra Faith.';
 return description ? description + (id === 'nails' || id === 'hinges_fittings' || id === 'lock_key' ? ' One of each tool applies.' : ' One of each tool applies; outputs round to whole units.') : '';
}

export function getBrokenToolDescription(id: unknown): string {
 return id === 'lock_key' ? 'Broken tool. Provides no treasury protection.' : id === 'church_bell' ? 'Broken tool. Provides no Faith gain.' : id === 'nails' ? 'Broken tool. Provides no construction discount.' : id === 'hinges_fittings' ? 'Broken tool. Provides no wear protection.' : 'Broken tool. Provides no production bonus.';
}
