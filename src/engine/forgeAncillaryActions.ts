import type {SavedMarketState} from '../save/savedMarket.ts';
import {isForgePlannerState} from './forgeState.ts';
import type {Inventory} from '../data/economy.ts';
import {FORGE_RESOURCES, FORGE_SUPPLY_EVENTS, generateForgeMarketPrices, type ForgeResourceId, type ForgeSeason, type ForgeSupplyDefinition} from '../data/blacksmith.ts';
import {consumeMarketSupply} from "./marketSupply.ts";
import {isPositivePrice,isPositiveQuantity} from './transactionValidation.ts';
export type ForgeAncillaryCommand =
 | {type:'BLACKSMITH_BUY_RESOURCE';payload:{resource:ForgeResourceId;quantity:number}}
 | {type:'BLACKSMITH_ADVANCE_WAT'|'BLACKSMITH_ADVANCE_BANTER'|'BLACKSMITH_DISMISS_SUPPLY_EVENT'|'BLACKSMITH_INVEST_IRON_VEIN'};
interface AncillaryContext {readonly phase:string;readonly turn:number;readonly year:number;readonly season:string;readonly denarii:number;readonly inventory:Readonly<Inventory>;readonly blacksmith?:unknown;readonly market:SavedMarketState}
function record(value:unknown):value is Record<string,unknown> {return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function array(value:unknown):value is readonly unknown[] {return Array.isArray(value);}
function amount(value:unknown):value is number {return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;}
function season(value:unknown):value is ForgeSeason {return value==='spring'||value==='summer'||value==='autumn'||value==='winter';}
function resource(value:unknown):value is ForgeResourceId {return typeof value==='string'&&FORGE_RESOURCES.some(item=>item.key===value);}
/** Authored mechanics are selected by ID; older stored narrative wording may remain. */
export function resolveForgeSupply(value:unknown):ForgeSupplyDefinition|null {
 if(!record(value)) return null;
 const definition=FORGE_SUPPLY_EVENTS.find(event=>event.id===value.id);
 if(!definition || (value.effect!==undefined&&value.effect!==definition.effect)) return null;
 return {...definition,name:typeof value.name==='string'?value.name:definition.name,
  description:typeof value.description==='string'?value.description:definition.description,
  godricComment:typeof value.godricComment==='string'?value.godricComment:definition.godricComment};
}
export function getForgeSupplyStatus(blacksmith:unknown) {
 const bs=blacksmith ?? {};if(!record(bs)) return null;
 if(bs.activeSupplyEvent==null) return {event:null,remaining:0};
 const event=resolveForgeSupply(bs.activeSupplyEvent);if(!event) return null;
 const remaining=bs.supplyEventTurnsLeft ?? event.duration;
 if(!amount(remaining)||!Number.isSafeInteger(remaining)||remaining>event.duration) return null;
 return {event,remaining};
}
/** Price conditions modify the cached base quote without rewriting it or drawing RNG. */
export function getForgeResourceQuote(id:unknown,currentSeason:unknown,blacksmith:unknown):number|null {
 if(!resource(id)||!season(currentSeason)) return null;
 const bs=blacksmith ?? {};if(!record(bs)) return null;
 const prices=bs.marketPrices;if(prices!=null&&!record(prices)) return null;
 const price=record(prices)?prices[id] ?? generateForgeMarketPrices(currentSeason,()=>0.5)[id]:generateForgeMarketPrices(currentSeason,()=>0.5)[id];
 // Generated base prices have a one-denarius floor; discounts apply afterward.
 if(!isPositivePrice(price)||!amount(price)||price<1) return null;
 const supply=getForgeSupplyStatus(bs);if(!supply) return null;
 const factor=supply.remaining>0&&supply.event?.effect==='iron_price_double'&&id==='iron'?2:
  supply.remaining>0&&supply.event?.effect==='coal_price_half'&&id==='coal'?0.5:1;
 const quote=price*factor;return isPositivePrice(quote)&&amount(quote)?quote:null;
}
/** Acknowledgement consumes usedSupplyEventIds once; it never restarts the saved countdown. */
export function planForgeAncillary(state:AncillaryContext,type:ForgeAncillaryCommand['type'],payload:unknown) {
 if(state.phase!=='management'||!Number.isSafeInteger(state.turn)||state.turn<1||state.turn>40||
  state.year!==Math.ceil(state.turn/4)||!season(state.season)||state.season!==['spring','summer','autumn','winter'][(state.turn-1)%4]) return null;
 const bs=state.blacksmith ?? {};if(!isForgePlannerState(bs,state.turn)) return null;
 if(type==='BLACKSMITH_ADVANCE_WAT'||type==='BLACKSMITH_ADVANCE_BANTER') {
  const field=type==='BLACKSMITH_ADVANCE_WAT'?'watFactIndex':'banterIndex',index=bs[field] ?? 0;
  if(!amount(index)||!Number.isSafeInteger(index)||index>=Number.MAX_SAFE_INTEGER) return null;
  return {patch:{blacksmith:{...bs,[field]:index+1}},message:null,chronicleKind:'action' as const};
 }
 if(type==='BLACKSMITH_BUY_RESOURCE') {
  if(!record(payload)||!resource(payload.resource)||!isPositiveQuantity(payload.quantity)||!record(state.inventory)||!amount(state.denarii)) return null;
  const price=getForgeResourceQuote(payload.resource,state.season,bs);if(price===null) return null;
  const supply=consumeMarketSupply(state.market,state.turn,payload.resource,payload.quantity);if(!supply)return null;
  const cost=price*payload.quantity,stock=state.inventory[payload.resource] ?? 0,invested=bs.totalGoldInvested ?? 0;
  if(!amount(cost)||cost<=0||state.denarii<cost||!amount(stock)||!amount(stock+payload.quantity)||!amount(invested)||!amount(invested+cost)) return null;
  const denarii=state.denarii-cost,totalGoldInvested=invested+cost;
  // Bound currency rounding by the transaction, not by a potentially corrupted balance.
  const tolerance=Math.max(1e-8,8*Number.EPSILON*cost);
  if(Math.abs((state.denarii-denarii)-cost)>tolerance||Math.abs((totalGoldInvested-invested)-cost)>tolerance) return null;
  return {patch:{denarii,market:{...state.market,supply},inventory:{...state.inventory,[payload.resource]:stock+payload.quantity},blacksmith:{...bs,totalGoldInvested}},
   message:`Purchased ${payload.quantity} ${payload.resource} for ${cost} denarii.`,chronicleKind:'action' as const};
 }
 const supply=getForgeSupplyStatus(bs),used=bs.usedSupplyEventIds ?? [];
 if(!supply?.event||!array(used)||[...used].some(id=>typeof id!=='string')||used.includes(supply.event.id)) return null;
 const event=supply.event,usedSupplyEventIds=[...used,event.id];
 if(type==='BLACKSMITH_INVEST_IRON_VEIN') {
  const invested=bs.totalGoldInvested ?? 0,active=bs.ironVeinActive ?? false;
  if(event.effect!=='iron_investment'||typeof active!=='boolean'||active||!amount(state.denarii)||state.denarii<event.investCost||!amount(invested)||!amount(invested+event.investCost)) return null;
  return {patch:{denarii:state.denarii-event.investCost,blacksmith:{...bs,ironVeinActive:true,activeSupplyEvent:null,supplyEventTurnsLeft:0,usedSupplyEventIds,totalGoldInvested:invested+event.investCost}},
   message:`Invested ${event.investCost} denarii in the iron vein. +${event.investReward} iron per season.`,chronicleKind:'action' as const};
 }
 const inventory={...state.inventory};
 let denarii=state.denarii,message=`Forge event: ${event.name}.`;
 if(event.effect==='steel_bonus_5'||event.effect==='iron_loss_30') {
  if(!record(state.inventory)) return null;
  const key=event.effect==='steel_bonus_5'?'steel':'iron',stock=state.inventory[key] ?? 0;if(!amount(stock)) return null;
  if(event.effect==='steel_bonus_5') {if(!amount(stock+5)) return null;inventory[key]=stock+5;message+=' Acquired 5 superior steel bars.';}
  else {const lost=Math.floor(stock*0.3);inventory[key]=stock-lost;message+=` Lost ${lost} iron to rust.`;}
 } else if(event.effect==='royal_reward_50') {
  if(!amount(denarii)||!amount(denarii+50)) return null;denarii+=50;message+=' Received 50 denarii from the Crown.';
 }
 return {patch:{denarii,inventory,blacksmith:{...bs,activeSupplyEvent:supply.remaining>0?bs.activeSupplyEvent:null,supplyEventTurnsLeft:supply.remaining,usedSupplyEventIds}},message,chronicleKind:'event' as const};
}

/** Talk consumes one saved draw even when no banter starts; existing direct counter actions stay pure. */
export function planForgeTalk(state:AncillaryContext,random:()=>number) {
 const advance=planForgeAncillary(state,'BLACKSMITH_ADVANCE_BANTER',undefined);
 const index=record(state.blacksmith)?state.blacksmith.banterIndex ?? 0:0;
 if(!advance||!amount(index)) return null;
 const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1) return null;
 return {patch:draw<0.3?advance.patch:{},banterIndex:draw<0.3?index:null};
}
