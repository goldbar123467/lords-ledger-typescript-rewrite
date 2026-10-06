import {getDeployableTool, isWorkingTool, getDeployedToolIds} from './forgeTools.ts';
import {hasDefenseBonus} from './forgeReadiness.ts';
import {FORGE_RESOURCES, SCRAP_RECOVERY_RATE, getAvailableBuyers, getBuyerPrice, type ForgeBuyerDefinition, type ForgeBuyerId, type ForgeSeason, type ForgeResourceId} from '../data/blacksmith.ts';
export type ForgeItemCommand =
 | {type:'BLACKSMITH_EQUIP_ITEM';payload:{itemUid:number}}
 | {type:'BLACKSMITH_SELL_ITEM';payload:{itemUid:number;buyerId?:ForgeBuyerId}}
 | {type:'BLACKSMITH_SCRAP_ITEM';payload:{itemUid:number}};
interface ItemContext {
 readonly phase:string; readonly turn:number; readonly year:number; readonly season:string;
 readonly denarii:number; readonly inventory:Readonly<Record<string,number>>;
 readonly blacksmith:unknown; readonly greatHall?:unknown; readonly chapel?:unknown;
}
function record(value:unknown):value is Record<string,unknown> {return typeof value==='object' && value!==null && !Array.isArray(value);}
function array(value:unknown):value is readonly unknown[] {return Array.isArray(value);}
function amount(value:unknown):value is number {return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=Number.MAX_SAFE_INTEGER;}
function uid(value:unknown):value is number {return amount(value) && Number.isSafeInteger(value) && value>=1;}
function season(value:unknown):value is ForgeSeason {return value==='spring'||value==='summer'||value==='autumn'||value==='winter';}
interface OwnedItem extends Record<string,unknown> {uid:number;name:string;grade:string;category:string}
function readableItem(value:unknown):value is OwnedItem {
 return record(value) && Object.hasOwn(value,'uid') && uid(value.uid) &&
  typeof value.name==='string' && typeof value.grade==='string' && typeof value.category==='string';
}
/** Move the original owned item; do not rewrite historical saved names, grades or stats. */
export function planForgeItemAction(state:ItemContext,type:ForgeItemCommand['type'],payload:unknown) {
 if(state.phase!=='management' || !Number.isSafeInteger(state.turn) || state.turn<1 || state.turn>40 ||
    state.year!==Math.ceil(state.turn/4) || !season(state.season) ||
    state.season!==['spring','summer','autumn','winter'][(state.turn-1)%4] ||
    !record(payload) || !uid(payload.itemUid) || !record(state.blacksmith)) return null;
 const bs=state.blacksmith, inventory=bs.inventory ?? [], equipped=bs.equipped ?? [];
 if(!array(inventory) || !array(equipped)) return null;
 const identities=new Set<number>();
 for(const item of [...inventory,...equipped]) {
  if(!record(item) || !Object.hasOwn(item,'uid') || !uid(item.uid) || identities.has(item.uid)) return null;
  identities.add(item.uid);
 }
 const item=inventory.find(candidate=>record(candidate) && candidate.uid===payload.itemUid);
 if(!readableItem(item)) return null;
 const remaining=inventory.filter(candidate=>candidate!==item);
 if(type==='BLACKSMITH_EQUIP_ITEM') {
  const militaryBonus=item.militaryBonus ?? 0;
  if(getDeployableTool(item.itemId)&&!isWorkingTool(item)) return null;
  if(!amount(militaryBonus) || ((item.category==='weapon'||item.category==='armor')&&!hasDefenseBonus(militaryBonus))) return null;
  // Existing equipped ownership is the durable first-installation receipt, including old saves.
  const firstBell=item.itemId==='church_bell' && !getDeployedToolIds(bs).has('church_bell');
  let chapelPatch: {chapel: Record<string,unknown>} | Record<string,never> = {};
  let faithGain=0;
  if(firstBell) {
   if(!record(state.chapel)) return null;
   const faith=state.chapel.faith ?? 50;
   if(!amount(faith)||faith>100) return null;
   const nextFaith=Math.min(100,faith+8);faithGain=nextFaith-faith;
   chapelPatch={chapel:{...state.chapel,faith:nextFaith}};
  }
  return {patch:{...chapelPatch,blacksmith:{...bs,inventory:remaining,equipped:[...equipped,item]}},
   message:getDeployableTool(item.itemId)?`Deployed a ${item.grade} ${item.name} on the estate.${firstBell?` Chapel Faith +${faithGain}.`:""}`:`Equipped a ${item.grade} ${item.name} to the garrison (+${militaryBonus} military).`};
 }
 if(type==='BLACKSMITH_SCRAP_ITEM') {
  const cost=item.cost ?? {}, materials={...state.inventory}, recovered:Partial<Record<ForgeResourceId,number>>={};
  if(!record(cost) || !record(state.inventory)) return null;
  // Preserve stored cost order in the historical chronicle, refund only Forge materials.
  for(const [key,value] of Object.entries(cost)) {
   if(!amount(value)) return null;
   if(key==='gold') continue;
   const resource=FORGE_RESOURCES.find(resource=>resource.key===key);
   if(!resource) return null;
   const refund=Math.floor(value*SCRAP_RECOVERY_RATE);
   if(refund===0) continue;
   const stock=state.inventory[resource.key] ?? 0;
   if(!amount(stock) || !amount(stock+refund)) return null;
   materials[resource.key]=stock+refund;recovered[resource.key]=refund;
  }
  const recovery=Object.entries(recovered).map(([key,value])=>`${value} ${key}`).join(', ');
  return {patch:{inventory:materials,blacksmith:{...bs,inventory:remaining}},
   message:`Scrapped a ${item.grade} ${item.name}.${recovery?` Recovered: ${recovery}.`:''}`};
 }
 const tradeValue=item.tradeValue ?? 0, sales=bs.salesThisSeason ?? 0, earned=bs.totalGoldEarned ?? 0;
 const soldToMortimer=bs.soldToMortimer ?? false;
 if(!amount(tradeValue) || !amount(state.denarii) || !amount(sales) || !Number.isSafeInteger(sales) ||
    sales>=Number.MAX_SAFE_INTEGER || !amount(earned) || typeof soldToMortimer!=='boolean' ||
    (payload.buyerId!==undefined && typeof payload.buyerId!=='string')) return null;
 const hall=record(state.greatHall)?state.greatHall:{}, flags=record(hall.compoundFlags)?hall.compoundFlags:{};
 const buyer:ForgeBuyerDefinition|undefined=payload.buyerId===undefined?undefined:getAvailableBuyers(state.season,{greatHall:{compoundFlags:{welcomedHenrik:flags.welcomedHenrik===true}}}).find(b=>b.id===payload.buyerId);
 if(payload.buyerId!==undefined && (!buyer || !buyer.prefers.some(category=>category===item.category))) return null;
 const price=buyer?getBuyerPrice(buyer,{category:item.category,grade:item.grade,tradeValue},sales):tradeValue;
 if(!amount(price) || !amount(state.denarii+price) || !amount(earned+price)) return null;
 let respect=bs.godricRespect;
 if(respect!=null && (!amount(respect) || respect>100)) return null;
 if(buyer?.respectCost) {
  const previous=respect ?? 50;if(!amount(previous) || previous>100) return null;
  respect=Math.max(0,Math.min(100,previous+buyer.respectCost));
 }
 return {patch:{denarii:state.denarii+price,blacksmith:{...bs,inventory:remaining,totalGoldEarned:earned+price,
   salesThisSeason:sales+1,soldToMortimer:soldToMortimer || buyer?.riskFlag==='soldToMortimer',godricRespect:respect}},
  message:buyer?`Sold a ${item.grade} ${item.name} to ${buyer.name} for ${price} denarii.`:`Sold a ${item.grade} ${item.name} for ${price} denarii.`};
}
