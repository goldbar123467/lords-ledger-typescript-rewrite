/** Finite seasonal purchases bound resale loops without removing profitable commerce. */
import {RESOURCE_CONFIG, type ResourceId} from '../data/economy.ts';
export const MARKET_SUPPLY_PER_RESOURCE = 100;
export interface MarketSupply { readonly turn:number; readonly purchased:Readonly<Partial<Record<ResourceId,number>>> }
function record(value:unknown):value is Record<string,unknown> {return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function enumerableOwn(value:Record<string,unknown>,key:string):boolean {return Object.prototype.propertyIsEnumerable.call(value,key);}
export function isMarketSupply(value:unknown,currentTurn:number):value is MarketSupply {
 if(!record(value)||!enumerableOwn(value,'turn')||!enumerableOwn(value,'purchased')||
  typeof value.turn!=='number'||!Number.isSafeInteger(value.turn)||value.turn<1||value.turn!==currentTurn||!record(value.purchased))return false;
 const purchased=value.purchased;
 const prototype=Object.getPrototypeOf(purchased);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 return Reflect.ownKeys(purchased).every(key=>typeof key==='string'&&Object.hasOwn(RESOURCE_CONFIG,key)&&enumerableOwn(purchased,key)&&
  typeof purchased[key]==='number'&&Number.isSafeInteger(purchased[key])&&purchased[key]>=0&&purchased[key]<=MARKET_SUPPLY_PER_RESOURCE);
}
/** Invalid receipts fail closed; only the authoritative calendar transition creates fresh supply. */
export function remainingMarketSupply(market:unknown,turn:number,resource:unknown):number {
 if(!Number.isSafeInteger(turn)||turn<1||turn>40||typeof resource!=='string'||!Object.hasOwn(RESOURCE_CONFIG,resource)||!record(market))return 0;
 if(!Object.hasOwn(market,'supply'))return MARKET_SUPPLY_PER_RESOURCE;
 if(!enumerableOwn(market,'supply')||!isMarketSupply(market.supply,turn))return 0;
 return market.supply.turn===turn?MARKET_SUPPLY_PER_RESOURCE-(market.supply.purchased[resource as ResourceId]??0):MARKET_SUPPLY_PER_RESOURCE;
}
export function consumeMarketSupply(market:unknown,turn:number,resource:unknown,quantity:number):MarketSupply|null {
 if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>remainingMarketSupply(market,turn,resource)||!record(market)||typeof resource!=='string')return null;
 const previous=isMarketSupply(market.supply,turn)&&market.supply.turn===turn?market.supply.purchased:{};
 return {turn,purchased:{...previous,[resource]:(previous[resource as ResourceId]??0)+quantity}};
}
