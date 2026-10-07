import {FORGEABLE_ITEMS, FORGE_RESOURCES, FORGE_SUPPLY_EVENTS, ITEM_CATEGORIES, type ForgeItemId, type ForgeCategory, type ForgeSeason, type ForgeResourceId} from '../data/blacksmith.ts';

export type ForgeSavedPrices = Readonly<Partial<Record<ForgeResourceId, number | null>>>;
/** Historical display wording and numeric stats are preserved, not reconstructed from current recipes. */
export interface ForgeSavedProduction {
 readonly itemId?: ForgeItemId | null;
 readonly name: string;
 readonly category: ForgeCategory;
 readonly grade: string;
 readonly qualityScore?: number | null;
 readonly militaryBonus?: number | null;
 readonly tradeValue?: number | null;
 readonly turn?: number | null;
 readonly season?: ForgeSeason | null;
 readonly goldCost?: number | null;
}
export interface ForgeSavedItem extends Omit<ForgeSavedProduction, 'turn' | 'season' | 'goldCost'> {
 readonly uid: number;
 readonly durability?: string | null;
 readonly cost?: Readonly<Partial<Record<ForgeResourceId | 'gold', number>>> | null;
 readonly forgedTurn?: number | null;
}
export interface ForgeSavedSupply {
 readonly id: typeof FORGE_SUPPLY_EVENTS[number]['id'];
 readonly effect?: typeof FORGE_SUPPLY_EVENTS[number]['effect'];
 readonly name?: string | null;
 readonly description?: string | null;
 readonly godricComment?: string | null;
 readonly duration?: number | null;
 readonly investCost?: number | null;
 readonly investReward?: number | null;
}
export interface ForgeSaveState {
 readonly inventory?: readonly ForgeSavedItem[] | null;
 readonly equipped?: readonly ForgeSavedItem[] | null;
 readonly nextItemUid?: number | null;
 readonly totalItemsForged?: number | null;
 readonly masterworksCreated?: number | null;
 readonly godricRespect?: number | null;
 readonly godricMood?: string | null;
 readonly watFactIndex?: number | null;
 readonly banterIndex?: number | null;
 readonly lastVisitTurn?: number | null;
 readonly marketPrices?: ForgeSavedPrices | null;
 readonly productionLog?: readonly ForgeSavedProduction[] | null;
 readonly priceHistory?: readonly {readonly turn: number; readonly season: ForgeSeason; readonly prices: ForgeSavedPrices}[] | null;
 readonly totalGoldInvested?: number | null;
 readonly totalGoldEarned?: number | null;
 readonly salesThisSeason?: number | null;
 readonly activeSupplyEvent?: ForgeSavedSupply | null;
 readonly supplyEventTurnsLeft?: number | null;
 readonly usedSupplyEventIds?: readonly string[] | null;
 readonly soldToMortimer?: boolean | null;
 readonly ironVeinActive?: boolean | null;
}
function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
function amount(value: unknown): value is number {return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;}
function count(value: unknown): value is number {return amount(value) && Number.isSafeInteger(value);}
function text(value: unknown): value is string {return typeof value === 'string' && value.trim().length > 0;}
function itemId(value: unknown): value is ForgeItemId {return typeof value === 'string' && Object.hasOwn(FORGEABLE_ITEMS, value);}
function season(value: unknown): value is ForgeSeason {return typeof value === 'string' && ['spring','summer','autumn','winter'].includes(value);}
function dense(value: unknown, valid: (item: unknown) => boolean): value is readonly unknown[] {
 if (!Array.isArray(value)) return false;
 for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !valid(value[i])) return false;
 return true;
}
function prices(value: unknown): value is ForgeSavedPrices {
 return record(value) && Object.entries(value).every(([key, price]) => FORGE_RESOURCES.some(resource => resource.key === key) && (price == null || (amount(price) && price >= 1)));
}
function production(value: unknown, currentTurn: number): value is ForgeSavedProduction {
 if (!record(value) || !text(value.name) || !text(value.grade) || !ITEM_CATEGORIES.some(category => category.id === value.category)) return false;
 if (value.itemId != null && (!itemId(value.itemId) || FORGEABLE_ITEMS[value.itemId].category !== value.category)) return false;
 for (const key of ['qualityScore','militaryBonus','tradeValue','goldCost']) if (value[key] != null && !amount(value[key])) return false;
 if (value.qualityScore != null && (!amount(value.qualityScore) || value.qualityScore > 100)) return false;
 if (value.turn != null && (!count(value.turn) || value.turn < 1 || value.turn > currentTurn)) return false;
 if (value.season != null && (!season(value.season) || (count(value.turn) && value.season !== ['spring','summer','autumn','winter'][(value.turn - 1) % 4]))) return false;
 return true;
}
function owned(value: unknown, currentTurn: number): value is ForgeSavedItem {
 if (!production(value, currentTurn) || !record(value) || !count(value.uid) || value.uid < 1) return false;
 if (value.durability != null && typeof value.durability !== 'string') return false;
 if (value.forgedTurn != null && (!count(value.forgedTurn) || value.forgedTurn < 1 || value.forgedTurn > currentTurn)) return false;
 return value.cost == null || (record(value.cost) && Object.entries(value.cost).every(([key, cost]) => (key === 'gold' || FORGE_RESOURCES.some(resource => resource.key === key)) && amount(cost)));
}
/** Validate consumed Forge fields without changing legacy metadata, optional defaults or save bytes. */
export function validateForgeState(value: unknown, currentTurn: unknown, checkInvestmentTerms = true): string | null {
 if (!record(value) || !count(currentTurn) || currentTurn < 1 || currentTurn > 40) return 'Save Forge state is invalid.';
 for (const key of ['nextItemUid','totalItemsForged','masterworksCreated','watFactIndex','banterIndex','lastVisitTurn','salesThisSeason','supplyEventTurnsLeft']) {
  if (value[key] != null && !count(value[key])) return `Save Forge ${key} is invalid.`;
 }
 if (value.nextItemUid != null && (!count(value.nextItemUid) || value.nextItemUid < 1)) return 'Save Forge next item UID is invalid.';
 if (value.lastVisitTurn != null && (!count(value.lastVisitTurn) || value.lastVisitTurn > currentTurn)) return 'Save Forge visit receipt is invalid.';
 for (const key of ['totalGoldInvested','totalGoldEarned']) if (value[key] != null && !amount(value[key])) return `Save Forge ${key} is invalid.`;
 if (value.godricRespect != null && (!amount(value.godricRespect) || value.godricRespect > 100)) return 'Save Forge respect is invalid.';
 if (value.godricMood != null && typeof value.godricMood !== 'string') return 'Save Forge mood is invalid.';
 for (const key of ['soldToMortimer','ironVeinActive']) if (value[key] != null && typeof value[key] !== 'boolean') return `Save Forge ${key} is invalid.`;
 const identities = new Set<number>(), next = value.nextItemUid ?? 1;
 if (!count(next)) return 'Save Forge next item UID is invalid.';
 for (const key of ['inventory','equipped']) {
  if (value[key] == null) continue;
  if (!dense(value[key], item => owned(item, currentTurn))) return `Save Forge ${key} is invalid.`;
  for (const item of value[key]) {
   if (!owned(item, currentTurn) || identities.has(item.uid) || item.uid >= next) return 'Save Forge owned UID or next receipt is invalid.';
   identities.add(item.uid);
  }
 }
 if (value.productionLog != null && !dense(value.productionLog, entry => production(entry, currentTurn))) return 'Save Forge production log is invalid.';
 if (value.marketPrices != null && !prices(value.marketPrices)) return 'Save Forge market prices are invalid.';
 if (value.priceHistory != null && !dense(value.priceHistory, entry => record(entry) && count(entry.turn) && entry.turn >= 1 && entry.turn <= currentTurn && season(entry.season) && entry.season === ['spring','summer','autumn','winter'][(entry.turn - 1) % 4] && prices(entry.prices))) return 'Save Forge price history is invalid.';
 // Old repeated acknowledgements and opaque historical string receipts are inert and remain intact.
 if (value.usedSupplyEventIds != null && !dense(value.usedSupplyEventIds, text)) return 'Save Forge supply receipts are invalid.';
 const active = value.activeSupplyEvent;
 if (active == null) return (value.supplyEventTurnsLeft ?? 0) === 0 ? null : 'Save Forge supply countdown has no active event.';
 if (!record(active)) return 'Save Forge supply event is invalid.';
 const definition = FORGE_SUPPLY_EVENTS.find(event => event.id === active.id);
 if (!definition || (active.effect !== undefined && active.effect !== definition.effect) || (active.duration != null && active.duration !== definition.duration)) return 'Save Forge supply mechanics are invalid.';
 for (const key of ['name','description','godricComment']) if (active[key] != null && typeof active[key] !== 'string') return 'Save Forge supply narrative is invalid.';
 for (const key of ['investCost','investReward'] as const) {
  if (active[key] != null && ((typeof active[key] !== 'number' || !Number.isFinite(active[key])) || (checkInvestmentTerms &&
      (definition.effect !== 'iron_investment' || active[key] !== definition[key])))) return 'Save Forge investment mechanics are invalid.';
 }
 const remaining = value.supplyEventTurnsLeft ?? definition.duration;
 return count(remaining) && remaining <= definition.duration ? null : 'Save Forge supply countdown is invalid.';
}

/** Narrow planner input with the same complete known-field checks as persistence. */
export function isForgePlannerState(value: unknown, currentTurn: number): value is ForgeSaveState {
 // Plans derive investment terms from authored data. Persistence checks the cached terms too.
 return validateForgeState(value, currentTurn, false) === null;
}
