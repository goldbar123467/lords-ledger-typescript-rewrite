import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';import {writeV2Save,readV2Save} from '../../src/save/saveGame.ts';
function snapshot(value: unknown) {const read=readV2Save(writeV2Save(value));if(!read.ok)throw Error(read.error);return read.state;}
function chronicleTexts(value: unknown): string[] {
 if(typeof value!=='object'||value===null||!('chronicle' in value)||!Array.isArray(value.chronicle))throw Error('Missing chronicle');
 return value.chronicle.map((entry: unknown)=>{if(typeof entry!=='object'||entry===null||!('text' in entry)||typeof entry.text!=='string')throw Error('Invalid chronicle text');return entry.text;});
}
function equipped() {const initial=createInitialState(104);const made=gameReducer({...initial,phase:'management' as const,inventoryCapacity:10000},{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'hinges_fittings',qualityScore:50,completionUid:1}});assert.equal(present(made.blacksmith.inventory, "made.blacksmith.inventory").length,1);return gameReducer(made,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});}
test('Deployed fittings reduce seasonal wear and retain exact fractional condition in saves',()=>{
 const state=equipped(),after=snapshot(gameReducer(state,{type:'SIMULATE_SEASON'}));const farm=after.buildings.find(b=>typeof b!=='string'&&b.type==='strip_farm');assert.ok(farm&&typeof farm!=='string');assert.equal(farm.condition,98.1);const saved=readV2Save(writeV2Save(after));assert.ok(saved.ok);if(saved.ok)assert.deepEqual(saved.state.buildings,after.buildings);
});
test('Fractional crossings warn at the actual poor and ruined production thresholds',()=>{
 for(const condition of [51.8,26.8]){const state={...equipped(),buildings:[{type:'strip_farm',condition,instanceId:'cross',builtOnTurn:0}]},after=snapshot(gameReducer(state,{type:'SIMULATE_SEASON'}));const word=condition===51.8?'poor condition':'fallen into ruin';assert.ok(chronicleTexts(after).some(text=>text.includes(word)),word);}
});

import {getConditionAfterSeason,displayBuildingCondition} from '../../src/engine/buildingWear.ts';
import {getConstructionCost} from '../../src/engine/forgeTools.ts';

import {getAgricultureBonuses} from '../../src/engine/forgeAgriculture.ts';
test('Wear applies once, rounds to hundredths, respects winter and legacy strings',()=>{
 const state=snapshot(equipped()),item=state.blacksmith.equipped?.[0];assert.ok(item);const duplicate={...state.blacksmith,equipped:[item,{...item,uid:2}]},farm={type:'strip_farm',condition:100,instanceId:'f',builtOnTurn:0};
 assert.equal(getConditionAfterSeason(farm,'spring',state.blacksmith),98.1);assert.equal(getConditionAfterSeason(farm,'spring',duplicate),98.1);
 assert.equal(getConditionAfterSeason({...farm,type:'coal_pit'},'winter',state.blacksmith),94.3);
 assert.equal(getConditionAfterSeason('strip_farm','spring',state.blacksmith),100);assert.equal(getConditionAfterSeason({...farm,condition:1},'spring',state.blacksmith),0);
 let building={...farm,type:'sawmill'};for(let i=0;i<20;i++)building={...building,condition:getConditionAfterSeason(building,'spring',state.blacksmith)};assert.equal(building.condition,43);
});
test('Stored, broken, missing-ID tools keep old fractional arithmetic and prior bonuses',()=>{
 const state=snapshot(equipped()),item=state.blacksmith.equipped?.[0];assert.ok(item);const farm={type:'strip_farm',condition:79.123456,instanceId:'f',builtOnTurn:0};
 for(const equipped of [[],[{...item,qualityScore:0}],[{...item,itemId:null}]])assert.equal(getConditionAfterSeason(farm,'spring',{equipped}),farm.condition-2);
 const stored={...state.blacksmith,inventory:[item],equipped:[]};assert.equal(getConditionAfterSeason(farm,'spring',stored),farm.condition-2);
 assert.equal(getConstructionCost(80,state.blacksmith),80);assert.deepEqual(getAgricultureBonuses(state.blacksmith),{food:0,harvest:0});
});
test('Condition display avoids binary noise and optimistic fractional tier rounding',()=>{
 assert.equal(displayBuildingCondition(97.149999999),97.15);for(const threshold of [25,50,75,100])assert.equal(displayBuildingCondition(threshold-.001),threshold-.01);
});
