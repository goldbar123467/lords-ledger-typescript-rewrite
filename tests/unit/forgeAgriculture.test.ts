import assert from 'node:assert/strict';import test from 'node:test';import {createInitialState,gameReducer} from '../../src/engine/gameReducer.js';import {simulateEconomy} from '../../src/engine/economyEngine.ts';import {writeV2Save,readV2Save} from '../../src/save/saveGame.ts';
function owned(itemId='plowshare',qualityScore=50){const initial=createInitialState(104);return gameReducer({...initial,phase:'management',turn:3,season:'autumn',inventoryCapacity:10000,buildings:['demesne_field']},{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId,qualityScore,completionUid:1}});}
test('Deployed plowshare increases seasonal production, stored and broken tools do not',()=>{
 const state=owned(),active=gameReducer(state,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}}),plain=simulateEconomy(state,()=>0.5),boost=simulateEconomy(active,()=>0.5);assert.ok(boost.inventory.grain>plain.inventory.grain);assert.equal(plain.inventory.fish,boost.inventory.fish);const broken=owned('plowshare',0),moved=gameReducer(broken,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});assert.equal(moved,broken);assert.equal(active.rngState,state.rngState);assert.ok(readV2Save(writeV2Save(active)).ok);
});
test('Deployed scythe increases farm grain and duplicate tool types do not stack',()=>{
 const state=owned('scythe'),active=gameReducer(state,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}}),plain=simulateEconomy(state,()=>0.5),boost=simulateEconomy(active,()=>0.5);assert.ok(boost.inventory.grain>plain.inventory.grain);const duplicate={...active,blacksmith:{...active.blacksmith,nextItemUid:3,equipped:[...active.blacksmith.equipped,{...active.blacksmith.equipped[0],uid:2}]}};assert.deepEqual(simulateEconomy(duplicate,()=>0.5),boost);
});

import {getAgricultureBonuses, getAgricultureMultiplier} from '../../src/engine/forgeAgriculture.ts';
import {getBuildingOutput} from '../../src/engine/economyEngine.ts';
test('Authored rates add before seasonal whole-unit rounding, not per inventory stack',()=>{
 const bonuses={food:.05,harvest:.05};
 assert.deepEqual(getBuildingOutput('demesne_field',['demesne_field'],'autumn'),{grain:15});
 assert.deepEqual(getBuildingOutput('demesne_field',['demesne_field'],'autumn',{food:.05,harvest:0}),{grain:16});
 assert.deepEqual(getBuildingOutput('demesne_field',['demesne_field'],'autumn',bonuses),{grain:17});
 assert.deepEqual(getBuildingOutput('strip_farm',['strip_farm'],'spring',{food:0,harvest:.05}),{grain:4});
 assert.equal(getAgricultureMultiplier('iron',false,bonuses),1);assert.equal(getAgricultureMultiplier('flour',false,bonuses),1.05);
 assert.deepEqual(getBuildingOutput({type:'demesne_field',condition:0,instanceId:'ruin',builtOnTurn:0},[],'autumn',bonuses),{grain:0});
});
test('Historical nullable quality defaults, broken tools and stored holdings',()=>{
 const state=owned(),item=state.blacksmith.inventory[0];assert.ok(item);
 for(const quality of [null,undefined,30,100])assert.deepEqual(getAgricultureBonuses({equipped:[{...item,qualityScore:quality}]}),{food:.05,harvest:0});
 for(const quality of [0,29,NaN,101])assert.deepEqual(getAgricultureBonuses({equipped:[{...item,qualityScore:quality}]}),{food:0,harvest:0});
 assert.deepEqual(getAgricultureBonuses(state.blacksmith),{food:0,harvest:0});
});
test('Full stores cap building bonuses and missing converter inputs remain idle',()=>{
 const state=owned('scythe'),active=gameReducer(state,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});
 const full={...state,inventoryCapacity:0};assert.deepEqual(simulateEconomy({...active,inventoryCapacity:0},()=>.5),simulateEconomy(full,()=>.5));
 const inv={...state.inventory,grain:0,flour:0};const empty={...state,buildings:['mill'],inventory:inv};
 const result=simulateEconomy(empty,()=>.5);assert.equal(result.inventory.flour,0);assert.ok(result.report.some(line=>line.includes('not enough grain')));
});

for(const itemId of ['plowshare','scythe'])test('Season reducer consumes deployed '+itemId+' without extra RNG',()=>{
 const state=owned(itemId),active=gameReducer(state,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});
 const plain=gameReducer(state,{type:'SIMULATE_SEASON'}),boost=gameReducer(active,{type:'SIMULATE_SEASON'});
 assert.equal(boost.inventory.grain-plain.inventory.grain,itemId==='plowshare'?2:1);assert.equal(boost.rngState,plain.rngState);assert.ok(readV2Save(writeV2Save(boost)).ok);
});
