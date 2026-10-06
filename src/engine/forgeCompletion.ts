import {FORGEABLE_ITEMS, FORGE_RESOURCES, calculateGrade, type ForgeItemId} from '../data/blacksmith.ts';
export interface ForgeCompletionCommand {itemId:ForgeItemId; qualityScore:number; completionUid:number}
interface CompletionContext {
 readonly phase:string; readonly turn:number; readonly year:number; readonly season:string;
 readonly denarii:number; readonly inventory:Readonly<Record<string,number>>; readonly blacksmith:unknown;
}
function record(value:unknown): value is Record<string,unknown> {
 return typeof value==='object' && value!==null && !Array.isArray(value);
}
function array(value:unknown): value is readonly unknown[] {return Array.isArray(value);}
function nonnegative(value:unknown): value is number {return typeof value==='number' && Number.isFinite(value) && value>=0;}
function counter(value:unknown): value is number {return nonnegative(value) && Number.isSafeInteger(value) && value<Number.MAX_SAFE_INTEGER;}
function recipeId(value:unknown): value is ForgeItemId {return typeof value==='string' && Object.hasOwn(FORGEABLE_ITEMS,value);}
/** Costs and results belong to authored registries. The captured UID is consumed atomically with the item. */
export function planForgeCompletion(state:CompletionContext,payload:unknown) {
 if(state.phase!=='management' || !Number.isSafeInteger(state.turn) || state.turn<1 || state.turn>40 ||
    state.year!==Math.ceil(state.turn/4) || state.season!==['spring','summer','autumn','winter'][(state.turn-1)%4] ||
    !record(payload) || !recipeId(payload.itemId) || !nonnegative(payload.qualityScore) || payload.qualityScore>100 ||
    !record(state.blacksmith) || !record(state.inventory) || !nonnegative(state.denarii)) return null;
 const bs=state.blacksmith, uid=bs.nextItemUid ?? 1;
 const total=bs.totalItemsForged ?? 0, masterworks=bs.masterworksCreated ?? 0, invested=bs.totalGoldInvested ?? 0, respect=bs.godricRespect ?? 50;
 const inventory=bs.inventory===undefined ? [] : bs.inventory, equipped=bs.equipped===undefined ? [] : bs.equipped, log=bs.productionLog===undefined ? [] : bs.productionLog;
 if(!counter(uid) || uid<1 || payload.completionUid!==uid || !counter(total) || !counter(masterworks) ||
    !nonnegative(invested) || !nonnegative(respect) || respect>100 ||
    !array(inventory) || !array(equipped) || !array(log) ||
    [...inventory,...equipped].some(item=>!record(item) || !counter(item.uid) || item.uid<1 || item.uid>=uid)) return null;
 const supply=bs.activeSupplyEvent, duration=bs.supplyEventTurnsLeft ?? 0;
 if(!nonnegative(duration) || (supply!=null && (!record(supply) || typeof supply.effect!=='string')) ||
    (record(supply) && supply.effect==='forging_disabled' && duration>0)) return null;
 const recipe=FORGEABLE_ITEMS[payload.itemId], grade=calculateGrade(payload.qualityScore);
 if(state.denarii<recipe.cost.gold || FORGE_RESOURCES.some(({key: id})=>!nonnegative(state.inventory[id]) || state.inventory[id]<recipe.cost[id])) return null;
 const newInvested=invested+recipe.cost.gold;if(!Number.isFinite(newInvested) || newInvested>Number.MAX_SAFE_INTEGER) return null;
 const materials={...state.inventory};
 for(const {key: id} of FORGE_RESOURCES) materials[id]=(state.inventory[id] ?? 0)-recipe.cost[id];
 const item={uid,itemId:recipe.id,name:recipe.name,category:recipe.category,grade:grade.grade,qualityScore:payload.qualityScore,
  militaryBonus:Math.round(recipe.baseMilitary*grade.statMultiplier),tradeValue:Math.round(recipe.baseTradeValue*grade.tradeMultiplier),
  durability:grade.durability,cost:{...recipe.cost},forgedTurn:state.turn};
 const respectDelta=grade.grade==='Masterwork'?3:grade.grade==='Fine'?1:grade.grade==='Rough'?-2:grade.grade==='Scrap'?-5:0;
 return {item,denarii:state.denarii-recipe.cost.gold,inventory:materials,blacksmith:{...bs,
  inventory:[...inventory,item],nextItemUid:uid+1,totalItemsForged:total+1,masterworksCreated:masterworks+(grade.grade==='Masterwork'?1:0),
  godricRespect:Math.max(0,Math.min(100,respect+respectDelta)),totalGoldInvested:newInvested,
  productionLog:[...log,{itemId:item.itemId,name:item.name,category:item.category,grade:item.grade,qualityScore:item.qualityScore,
   tradeValue:item.tradeValue,militaryBonus:item.militaryBonus,turn:state.turn,season:state.season,goldCost:recipe.cost.gold}],
 }};
}
