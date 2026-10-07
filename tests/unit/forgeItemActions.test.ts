import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import {getAvailableBuyers,getBuyerPrice,SEASONAL_BUYERS} from '../../src/data/blacksmith.ts';
const own=(itemId='dagger',qualityScore=70)=>gameReducer({...createInitialState(104),phase:'management' as const},{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId,qualityScore,completionUid:1}});
const actions=['BLACKSMITH_EQUIP_ITEM','BLACKSMITH_SELL_ITEM','BLACKSMITH_SCRAP_ITEM'] as const;
test('Forge sale derives prices and consequences from stored item and eligible buyer',()=>{
 const state=own(),item=present(state.blacksmith.inventory, "state.blacksmith.inventory")[0];const generic=gameReducer(state,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1,price:1e6,buyerName:'Liar',respectCost:99}});
 assert.equal(generic.denarii,state.denarii+present(present(item, "item").tradeValue, "present(item, \"item\").tradeValue"));assert.equal(generic.blacksmith.godricRespect,state.blacksmith.godricRespect);assert.ok(!JSON.stringify(generic.chronicle).includes('Liar'));
 const winter={...state,turn:4,season:'winter' as const,blacksmith:{...state.blacksmith,godricRespect:0}},buyer=SEASONAL_BUYERS.find(b=>b.id==='mortimer_agent');assert.ok(buyer);
 const sale=gameReducer(winter,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1,buyerId:'mortimer_agent',price:1e6,respectCost:99,buyerName:'Liar'}});
 assert.equal(sale.denarii,winter.denarii+getBuyerPrice(buyer,present(item, "item"),0));assert.equal(sale.blacksmith.godricRespect,0);assert.equal(sale.blacksmith.soldToMortimer,true);
});
test('Forge item commands reject wrong phases/calendar, duplicate ownership and malformed UID',()=>{
 const state=own();for(const type of actions){const action={type,payload:{itemUid:1}};
  for(const patch of [{phase:'victory' as const},{phase:'title' as const},{turn:41},{year:25},{season:'winter' as const},{blacksmith:{...state.blacksmith,inventory:[...present(state.blacksmith.inventory, 'owned items'),...present(state.blacksmith.inventory, 'owned items')]}},{blacksmith:{...state.blacksmith,equipped:state.blacksmith.inventory}}]){const s={...state,...patch};assert.equal(gameReducer(s,action),s);}
  for(const itemUid of [null,'1',0,-1,1.5,NaN,Infinity,2])assert.equal(gameReducer(state,{type,payload:{itemUid}}),state);
  const next=gameReducer(state,action);assert.notEqual(next,state);assert.equal(gameReducer(next,action),next);assert.equal(next.rngState,state.rngState);
 }
});
test('Forge named buyers require current season, preferred category and authoritative compound flag',()=>{
 const state=own();for(const buyerId of ['unknown','mortimer_agent','church_procurement','foreign_merchant','local_merchant',null])assert.equal(gameReducer(state,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1,buyerId}}),state);
 const tool=own('plowshare'),welcomed={...tool,greatHall:{...tool.greatHall,compoundFlags:{...tool.greatHall.compoundFlags,welcomedHenrik:true}}};
 assert.ok(getAvailableBuyers('spring',welcomed).some(b=>b.id==='foreign_merchant'));
 const next=gameReducer(welcomed,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1,buyerId:'foreign_merchant'}});assert.notEqual(next,welcomed);assert.equal(present(next.blacksmith.inventory, "next.blacksmith.inventory").length,0);
 assert.ok(!getAvailableBuyers('spring',{greatHall:{rulingHistory:{welcomedHenrik:true}}}).some(b=>b.id==='foreign_merchant'));
});
test('Scrap only refunds readable known material costs and rejects corrupt consumed amounts',()=>{
 const state=own();for(const cost of [{grain:1000},{iron:Infinity},{iron:-1},{iron:'10'},[]]){const item={...present(state.blacksmith.inventory, "state.blacksmith.inventory")[0],cost},s={...state,blacksmith:{...state.blacksmith,inventory:[item]}};assert.equal(gameReducer(s,{type:'BLACKSMITH_SCRAP_ITEM',payload:{itemUid:1}}),s);}
 const item={...present(state.blacksmith.inventory, "state.blacksmith.inventory")[0],cost:{coal:5,iron:2.5,gold:100}},s={...state,blacksmith:{...state.blacksmith,inventory:[item]}};const next=gameReducer(s,{type:'BLACKSMITH_SCRAP_ITEM',payload:{itemUid:1}});assert.equal(next.inventory.coal,s.inventory.coal+2);assert.equal(next.inventory.iron,s.inventory.iron+1);assert.equal(next.denarii,s.denarii);
});
import {readV2Save,writeV2Save} from '../../src/save/saveGame.ts';
test('Forge item commands preserve historical metadata, zero/fractional prices and reject corrupt consumed fields',()=>{
 const state=own(),item={...present(state.blacksmith.inventory, "state.blacksmith.inventory")[0],name:'An older blade',grade:'Older quality',tradeValue:2.5,militaryBonus:1.5,cost:{wood:5,iron:3,gold:2},note:{old:true}},historical={...state,blacksmith:{...state.blacksmith,inventory:[item]}};
 const before=JSON.stringify(historical),equipped=gameReducer(historical,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});assert.equal(present(equipped.blacksmith.equipped, "equipped.blacksmith.equipped")[0],item);assert.equal(JSON.stringify(historical),before);
 const sold=gameReducer(historical,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1}});assert.equal(sold.denarii,historical.denarii+2.5);
 for(const tradeValue of [0,null,undefined]){const s={...historical,blacksmith:{...historical.blacksmith,inventory:[{...item,tradeValue}]}};const next=gameReducer(s,{type:'BLACKSMITH_SELL_ITEM',payload:{itemUid:1}});assert.equal(next.denarii,s.denarii);assert.equal(next.blacksmith.salesThisSeason,1);}
 for(const [type,itemPatch,bsPatch] of [
  ['BLACKSMITH_EQUIP_ITEM',{militaryBonus:Infinity},{}],['BLACKSMITH_SELL_ITEM',{tradeValue:NaN},{}],['BLACKSMITH_SELL_ITEM',{tradeValue:-1},{}],
  ['BLACKSMITH_SELL_ITEM',{}, {totalGoldEarned:Infinity}],['BLACKSMITH_SELL_ITEM',{}, {salesThisSeason:1.5}],['BLACKSMITH_SELL_ITEM',{}, {soldToMortimer:'false'}],
 ] as const){const s={...historical,blacksmith:{...historical.blacksmith,...bsPatch,inventory:[{...item,...itemPatch}]}};assert.equal(gameReducer(s,{type,payload:{itemUid:1}}),s);}
 for(const type of actions){const next=gameReducer(historical,{type,payload:{itemUid:1}}),loaded=readV2Save(writeV2Save(next));assert.ok(loaded.ok);if(loaded.ok){assert.deepEqual(loaded.state,next);assert.equal(gameReducer(loaded.state,{type,payload:{itemUid:1}}),loaded.state);}}
});
