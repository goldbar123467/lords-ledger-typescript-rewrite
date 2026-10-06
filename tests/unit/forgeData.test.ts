import assert from 'node:assert/strict';import test from 'node:test';import crypto from 'node:crypto';
import * as forge from '../../src/data/blacksmith.ts';
import {createRandomCursor} from '../../src/engine/random.ts';
test('Forge authored registries retain all identities, descriptions and values',()=>{
 const values=Object.fromEntries(Object.entries(forge).filter(([,value])=>typeof value!=='function'));
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'),'49771671350bb0ff37d36d75438d7ce6086e2fdb07f706542291046ef61ede17');
 assert.equal(Object.keys(forge).length,36);assert.equal(Object.keys(forge.FORGEABLE_ITEMS).length,35);assert.equal(forge.WAT_FACTS.length,20);assert.equal(forge.SEASONAL_BUYERS.length,5);assert.equal(forge.FORGE_SUPPLY_EVENTS.length,7);
 for(const[key,item]of Object.entries(forge.FORGEABLE_ITEMS)){assert.equal(item.id,key);assert.ok(forge.FORGING_DIFFICULTY[item.difficulty]);assert.deepEqual(Object.keys(item.cost),['iron','steel','coal','leather','wood','gold']);}
});
test('Forge grade boundaries, zero/fraction respect and fact cycles retain authored selection',()=>{
 for(const[score,grade]of [[0,'Scrap'],[29.5,'Scrap'],[30,'Rough'],[49.5,'Rough'],[50,'Standard'],[69.5,'Standard'],[70,'Fine'],[89.5,'Fine'],[90,'Masterwork']] as const)assert.equal(forge.calculateGrade(score).grade,grade);
 for(const[respect,behavior]of [[0,'disdain'],[19.5,'disdain'],[20,'neutral'],[39.5,'neutral'],[40,'warm'],[60,'respected'],[80,'trusted']] as const)assert.equal(forge.getGodricTier(respect).behavior,behavior);
 for(const trigger of new Set(forge.WAT_FACTS.map(f=>f.trigger))){const matching=forge.WAT_FACTS.filter(f=>f.trigger===trigger);for(let i=0;i<matching.length*2;i++)assert.deepEqual(forge.pickWatFact(trigger,i),matching[i%matching.length]);}
 assert.deepEqual(forge.pickWatFact('older_trigger',0),forge.WAT_FACTS.find(f=>f.trigger==='forge_general'));
});
test('Forge prices use exactly five saved draws and supply rolls retain short-circuit draw counts',()=>{
 for(const season of ['spring','summer','autumn','winter'] as const){const random=createRandomCursor(104),prices=forge.generateForgeMarketPrices(season,random.next);assert.equal(random.draws,5);for(const value of Object.values(prices))assert.ok(Number.isSafeInteger(value)&&value>=1);}
 let draws=0;const next=()=>{draws++;return 0;};assert.equal(forge.rollForgeSupplyEvent(3,[],next),null);assert.equal(draws,0);
 assert.equal(forge.rollForgeSupplyEvent(4,[],next)?.id,'iron_shortage');assert.equal(draws,2);
 assert.equal(forge.rollForgeSupplyEvent(4,forge.FORGE_SUPPLY_EVENTS.map(e=>e.id),next),null);assert.equal(draws,3);
});
test('Forge seasonal buyer prices retain category, quality and sequential rounding',()=>{
 const spring=forge.getAvailableBuyers('spring',{});assert.deepEqual(spring.map(b=>b.id),['local_merchant','arms_dealer']);
 assert.equal(forge.getBuyerPrice(forge.SEASONAL_BUYERS[0],{category:'tool',grade:'Standard',tradeValue:10},3),11);
 assert.equal(forge.getBuyerPrice(forge.SEASONAL_BUYERS[1],{category:'weapon',grade:'Masterwork',tradeValue:11},0),21);
 assert.equal(forge.getBuyerPrice(forge.SEASONAL_BUYERS[0],{category:'weapon',grade:'Scrap',tradeValue:0},0),1);
});
