import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.js';
import {FORGEABLE_ITEMS, calculateGrade} from '../../src/data/blacksmith.ts';
const base = () => ({...createInitialState(104),phase:'management'});
const complete = (itemId='dagger',qualityScore=70,completionUid=1) => ({type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId,qualityScore,completionUid,itemName:'Forged lie',itemCost:{iron:-10},goldCost:-100,grade:'Masterwork',baseMilitary:999,statMultiplier:999}});
test('Forge completion derives recipe costs and grade from authored definitions, preserving zero quality',()=>{
 for(const score of [0,29.5,30,49.5,50,69.5,70,89.5,90,100]){
  const state=base(),next=gameReducer(state,complete('dagger',score)),recipe=FORGEABLE_ITEMS.dagger,grade=calculateGrade(score);
  assert.equal(next.denarii,state.denarii-recipe.cost.gold);
  assert.equal(next.inventory.iron,state.inventory.iron-recipe.cost.iron);
  const item=next.blacksmith.inventory[0];assert.equal(item.name,recipe.name);assert.equal(item.grade,grade.grade);assert.equal(item.qualityScore,score);
  assert.equal(item.militaryBonus,Math.round(recipe.baseMilitary*grade.statMultiplier));assert.equal(item.tradeValue,Math.round(recipe.baseTradeValue*grade.tradeMultiplier));assert.deepEqual(item.cost,recipe.cost);assert.deepEqual(next.rngState,state.rngState);
 }
});
test('Forge completion rejects replay, wrong phase, unavailable materials and malformed commands',()=>{
 const state=base(),action=complete(),next=gameReducer(state,action);assert.equal(gameReducer(next,action),next);
 for(const phase of ['title','victory','game_over','raid_warning']){const s={...state,phase};assert.equal(gameReducer(s,action),s);}
 for(const payload of [null,[],{}, {itemId:'unknown',qualityScore:70,completionUid:1},...[-1,101,NaN,Infinity,'70'].map(qualityScore=>({itemId:'dagger',qualityScore,completionUid:1})),...[0,2,NaN,'1'].map(completionUid=>({itemId:'dagger',qualityScore:70,completionUid}))])assert.equal(gameReducer(state,{type:action.type,payload}),state);
 for(const s of [{...state,denarii:0},{...state,inventory:{...state.inventory,coal:0}},{...state,turn:41},{...state,year:25},{...state,season:'winter'},{...state,blacksmith:{...state.blacksmith,activeSupplyEvent:{effect:'forging_disabled'},supplyEventTurnsLeft:1}}])assert.equal(gameReducer(s,action),s);
});
test('Forge completion uses zero respect and rejects malformed consumed counters atomically',()=>{
 const state=base(),zero={...state,blacksmith:{...state.blacksmith,godricRespect:0}};assert.equal(gameReducer(zero,complete()).blacksmith.godricRespect,1);
 for(const patch of [{nextItemUid:0},{nextItemUid:Number.MAX_SAFE_INTEGER},{godricRespect:NaN},{totalItemsForged:-1},{totalGoldInvested:Infinity},{inventory:{}},{productionLog:'bad'},{equipped:[{uid:1}]}]){const s={...state,blacksmith:{...state.blacksmith,...patch}};assert.equal(gameReducer(s,complete()),s);}
});
import {readV2Save,writeV2Save} from '../../src/save/saveGame.ts';
test('All 35 Forge recipes and five grades persist exact canonical state and consume one UID',()=>{
 for(const recipe of Object.values(FORGEABLE_ITEMS))for(const score of [0,30,50,70,90]){
  const initial=base(),state={...initial,denarii:10000,inventory:{...initial.inventory,iron:1000,steel:1000,coal:1000,leather:1000,wood:1000}};
  const before=JSON.stringify(state),action=complete(recipe.id,score),next=gameReducer(state,action);
  assert.notEqual(next,state);assert.equal(JSON.stringify(state),before);assert.equal(next.blacksmith.inventory.length,1);assert.equal(next.blacksmith.nextItemUid,2);
  for(const key of ['iron','steel','coal','leather','wood'] as const)assert.equal(next.inventory[key],state.inventory[key]-recipe.cost[key]);
  const loaded=readV2Save(writeV2Save(next));assert.equal(loaded.ok,true);if(loaded.ok)assert.deepEqual(loaded.state,next);
  for(const type of ['BLACKSMITH_EQUIP_ITEM','BLACKSMITH_SELL_ITEM']){const moved=gameReducer(next,{type,payload:{itemUid:1}});assert.equal(gameReducer(moved,action),moved);}
 }
});
