import assert from 'node:assert/strict';import test from 'node:test';import {createInitialState,gameReducer} from '../../src/engine/gameReducer.js';import {FORGE_SUPPLY_EVENTS,generateForgeMarketPrices} from '../../src/data/blacksmith.ts';
const base=()=>({...createInitialState(104),phase:'management',turn:4,season:'winter'});
function pending(id:string){const state=base(),event=FORGE_SUPPLY_EVENTS.find(e=>e.id===id);if(!event)throw Error('Missing event');return {...state,blacksmith:{...state.blacksmith,activeSupplyEvent:event,supplyEventTurnsLeft:event.duration}};}
test('Forge supply acknowledgements are consumed once and preserve an elapsed disruption countdown',()=>{
 const state=pending('iron_shortage'),s={...state,blacksmith:{...state.blacksmith,supplyEventTurnsLeft:1}},action={type:'BLACKSMITH_DISMISS_SUPPLY_EVENT'},next=gameReducer(s,action);
 assert.equal(next.blacksmith.supplyEventTurnsLeft,1);assert.deepEqual(next.blacksmith.usedSupplyEventIds,['iron_shortage']);assert.equal(gameReducer(next,action),next);assert.equal(next.rngState,s.rngState);
 for(const id of ['traveling_master','rust_in_stores','kings_commission']){const s=pending(id),n=gameReducer(s,action);assert.equal(n.blacksmith.activeSupplyEvent,null);assert.equal(gameReducer(n,action),n);}
});
test('Forge investment derives authored cost/reward and refuses already-owned or consumed veins',()=>{
 const state=pending('iron_vein'),s={...state,blacksmith:{...state.blacksmith,activeSupplyEvent:{...state.blacksmith.activeSupplyEvent,investCost:-30,investReward:999}}},action={type:'BLACKSMITH_INVEST_IRON_VEIN'},next=gameReducer(s,action);
 assert.equal(next.denarii,s.denarii-30);assert.equal(next.blacksmith.totalGoldInvested,30);assert.equal(next.blacksmith.ironVeinActive,true);assert.ok(!JSON.stringify(next.chronicle).includes('999'));
 for(const patch of [{ironVeinActive:true},{usedSupplyEventIds:['iron_vein']}]){const s={...state,blacksmith:{...state.blacksmith,...patch}};assert.equal(gameReducer(s,action),s);}
});
test('Forge active supply prices double iron or halve coal consistently until expiry',()=>{
 for(const [id,resource,factor] of [['iron_shortage','iron',2],['charcoal_surplus','coal',0.5]] as const){const state=pending(id),price=generateForgeMarketPrices('winter',()=>0.5)[resource],next=gameReducer(state,{type:'BLACKSMITH_BUY_RESOURCE',payload:{resource,quantity:1,price:0}});assert.equal(next.denarii,state.denarii-price*factor);assert.equal(next.inventory[resource],state.inventory[resource]+1);
  const expired={...state,blacksmith:{...state.blacksmith,supplyEventTurnsLeft:0}},regular=gameReducer(expired,{type:'BLACKSMITH_BUY_RESOURCE',payload:{resource,quantity:1}});assert.equal(regular.denarii,expired.denarii-price);
 }
});
test('Forge ancillary commands reject invalid phase/calendar, corrupted consumed values and event identities',()=>{
 const initial=base();for(const type of ['BLACKSMITH_ADVANCE_WAT','BLACKSMITH_ADVANCE_BANTER','BLACKSMITH_DISMISS_SUPPLY_EVENT','BLACKSMITH_INVEST_IRON_VEIN','BLACKSMITH_BUY_RESOURCE'])for(const patch of [{phase:'victory'},{phase:'title'},{turn:41},{year:25},{season:'spring'}]){const state={...pending('iron_vein'),...patch};assert.equal(gameReducer(state,{type,payload:{resource:'iron',quantity:1}}),state);}
 for(const [type,patch] of [['BLACKSMITH_ADVANCE_WAT',{watFactIndex:'0'}],['BLACKSMITH_ADVANCE_BANTER',{banterIndex:-1}],['BLACKSMITH_DISMISS_SUPPLY_EVENT',{usedSupplyEventIds:'bad'}],['BLACKSMITH_DISMISS_SUPPLY_EVENT',{activeSupplyEvent:{id:'unknown',effect:'royal_reward_50'}}],['BLACKSMITH_DISMISS_SUPPLY_EVENT',{activeSupplyEvent:{id:'iron_shortage',effect:'royal_reward_50'}}]] as const){const state={...initial,blacksmith:{...initial.blacksmith,...patch}};assert.equal(gameReducer(state,{type}),state);}
 for(const stock of ['0',Infinity,-1]){const state={...initial,inventory:{...initial.inventory,iron:stock}};assert.equal(gameReducer(state,{type:'BLACKSMITH_BUY_RESOURCE',payload:{resource:'iron',quantity:1}}),state);}
});
test('Expired duration events clear before new rolls; instant rewards remain pending; sparse receipts reject',()=>{
 const state=pending('iron_shortage'),expired={...state,blacksmith:{...state.blacksmith,supplyEventTurnsLeft:0,usedSupplyEventIds:['iron_shortage']}};
 const next=gameReducer(expired,{type:'SIMULATE_SEASON'});assert.notEqual(next.blacksmith.activeSupplyEvent?.id,'iron_shortage');assert.notEqual(next.rngState,expired.rngState);
 const reward=pending('kings_commission'),waiting=gameReducer(reward,{type:'SIMULATE_SEASON'});assert.equal(waiting.blacksmith.activeSupplyEvent?.id,'kings_commission');
 const sparse={...reward,blacksmith:{...reward.blacksmith,usedSupplyEventIds:new Array(1)}};assert.equal(gameReducer(sparse,{type:'BLACKSMITH_DISMISS_SUPPLY_EVENT'}),sparse);
});

test('Forge purchases reject sub-unit base quotes and unrepresentable cash or investment changes',()=>{
 const action={type:'BLACKSMITH_BUY_RESOURCE',payload:{resource:'coal',quantity:1}},initial=pending('charcoal_surplus');
 for(const patch of [{denarii:500,marketPrices:{coal:1e-100},totalGoldInvested:0},{denarii:Number.MAX_SAFE_INTEGER-1,marketPrices:{coal:1},totalGoldInvested:0},{denarii:500,marketPrices:{coal:1},totalGoldInvested:Number.MAX_SAFE_INTEGER-1}]){
  const state={...initial,denarii:patch.denarii,blacksmith:{...initial.blacksmith,marketPrices:patch.marketPrices,totalGoldInvested:patch.totalGoldInvested}};assert.equal(gameReducer(state,action),state);
 }
 for(const price of [1,1.1,2.5]){const state={...initial,blacksmith:{...initial.blacksmith,marketPrices:{coal:price}}},next=gameReducer(state,action);assert.notEqual(next,state);assert.ok(Math.abs(state.denarii-next.denarii-price/2)<1e-10);assert.equal(next.blacksmith.totalGoldInvested,price/2);assert.equal(next.inventory.coal,state.inventory.coal+1);assert.equal(next.rngState,state.rngState);}
});
