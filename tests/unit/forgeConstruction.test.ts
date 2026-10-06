import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.js';
import {canBuildBuilding} from '../../src/engine/economyEngine.ts';
import {getUpgradeEligibility} from '../../src/engine/buildingActions.ts';
import {writeV2Save, readV2Save} from '../../src/save/saveGame.ts';
function nails(qualityScore=50) {
 const state={...createInitialState(104),phase:'management'};
 const made=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'nails',qualityScore,completionUid:1}});
 assert.equal(made.blacksmith.inventory.length,1);
 return made;
}
function deployed(qualityScore=50) {return gameReducer(nails(qualityScore),{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});}
test('Working Nails quote and pay a 76-denarii Strip Farm at the affordability boundary',()=>{
 const state={...deployed(),denarii:76,buildings:[]};
 assert.equal(canBuildBuilding('strip_farm',state).canBuild,true);
 const result=gameReducer(state,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}});
 assert.equal(result.denarii,0);assert.equal(result.buildings.length,1);
 assert.equal(result.rngState,state.rngState);assert.ok(readV2Save(writeV2Save(result)).ok);
});
test('Working Nails quote and pay a 114-denarii legacy farm upgrade',()=>{
 const state={...deployed(),denarii:114,buildings:['strip_farm']};
 const quote=getUpgradeEligibility(state,0);assert.equal(quote.cost,114);assert.equal(quote.allowed,true);
 const result=gameReducer(state,{type:'UPGRADE_BUILDING',payload:{buildingIndex:0}});
 assert.equal(result.denarii,0);assert.equal(result.buildings[0].type,'demesne_field');
 assert.equal(result.rngState,state.rngState);assert.ok(readV2Save(writeV2Save(result)).ok);
});

import {getConstructionCost, getDeployedToolIds} from '../../src/engine/forgeTools.ts';
import BUILDINGS from '../../src/data/buildings.ts';
test('Construction discount rounds up and duplicate Nails do not stack',()=>{
 const state=deployed(),items=state.blacksmith.equipped,duplicate={...state.blacksmith,equipped:[...items,{...items[0],uid:2}]};
 assert.equal(getConstructionCost(45,state.blacksmith),43);assert.equal(getConstructionCost(45,duplicate),43);
 for(const building of Object.values(BUILDINGS))assert.equal(getConstructionCost(building.cost,state.blacksmith),Math.ceil(building.cost*95/100));
 assert.deepEqual([...getDeployedToolIds(duplicate)],['nails']);
});
test('Stored, broken and anonymous historical tools do not discount; known null quality defaults do',()=>{
 const state=nails(),item=state.blacksmith.inventory[0];assert.ok(item);
 assert.equal(getConstructionCost(80,state.blacksmith),80);
 for(const qualityScore of [null,undefined,30,100])assert.equal(getConstructionCost(80,{equipped:[{...item,qualityScore}]}),76);
 for(const qualityScore of [0,29,NaN,101])assert.equal(getConstructionCost(80,{equipped:[{...item,qualityScore}]}),80);
 assert.equal(getConstructionCost(80,{equipped:[{...item,itemId:null}]}),80);
 const broken=nails(0);assert.equal(gameReducer(broken,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}}),broken);
});
test('Discount retains prerequisites, plots, limits and below-quote rejection',()=>{
 const state={...deployed(),denarii:75,buildings:[]};assert.equal(gameReducer(state,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}}),state);
 assert.equal(canBuildBuilding('strip_farm',state).reason,'Need 76d (have 75d)');
 assert.equal(canBuildBuilding('strip_farm',{...state,denarii:1000,totalPlots:0}).canBuild,false);
 assert.equal(canBuildBuilding('mill',{...state,denarii:1000}).canBuild,false);
 const max={...state,denarii:1000,buildings:Array(4).fill('strip_farm')};assert.equal(gameReducer(max,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}}),max);
 const upgrade={...state,denarii:113,buildings:['strip_farm']};assert.equal(gameReducer(upgrade,{type:'UPGRADE_BUILDING',payload:{buildingIndex:0}}),upgrade);
 const wrongPhase={...state,denarii:1000,phase:'events'};assert.equal(gameReducer(wrongPhase,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}}),wrongPhase);
});
test('Demolition refunds and repairs retain their existing rules',()=>{
 const item={type:'strip_farm',condition:50,instanceId:'old-farm',builtOnTurn:0};const active={...deployed(),denarii:1000,buildings:[item]},stored={...active,blacksmith:nails().blacksmith};
 for(const type of ['DEMOLISH_BUILDING','REPAIR_BUILDING']){const a=gameReducer(active,{type,payload:{buildingIndex:0}}),b=gameReducer(stored,{type,payload:{buildingIndex:0}});assert.equal(a.denarii,b.denarii);assert.deepEqual(a.buildings,b.buildings);}
});
