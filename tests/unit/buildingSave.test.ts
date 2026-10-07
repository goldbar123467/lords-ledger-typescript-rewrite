import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState} from '../../src/engine/gameReducer.ts';
import {getTotalBuildingUpkeep} from '../../src/engine/economyEngine.ts';
import {readLegacySave,readV2Save,writeV2Save} from '../../src/save/saveGame.ts';

const building=()=>({instanceId:'waiver-probe',type:'coal_pit',condition:100,builtOnTurn:0});
const fixture=(entry:unknown)=>({...createInitialState(104),phase:'management' as const,buildings:[entry]});

test('raw legacy and v2 readers reject malformed upkeep waivers without changing bytes',()=>{
 for(const freeUpkeep of ['false','true',0,1,null,{},[]]){
  const state=fixture({...building(),freeUpkeep});
  const legacy=JSON.stringify(state),v2=JSON.stringify({format:'lords-ledger',version:2,state});
  for(const result of [readLegacySave(legacy),readV2Save(v2)]){
   assert.equal(result.ok,false);if(!result.ok)assert.match(result.error,/building.*freeUpkeep/i);
  }
  assert.equal(JSON.stringify(state),legacy);
 }
});

test('writer rejects malformed waiver values instead of persisting free charges',()=>{
 for(const freeUpkeep of ['false',1,null,{},[]])assert.throws(()=>writeV2Save(fixture({...building(),freeUpkeep})),/building.*freeUpkeep/i);
});

test('writer rejects hidden and inherited waiver flags rather than silently losing them',()=>{
 const hidden=building();Object.defineProperty(hidden,'freeUpkeep',{value:true,enumerable:false});
 assert.throws(()=>writeV2Save(fixture(hidden)),/building/i);
 const inherited=Object.assign(Object.create({freeUpkeep:true}),building());
 assert.throws(()=>writeV2Save(fixture(inherited)),/building/i);
});

test('writer rejects building field getters and serializers before invoking them',()=>{
 let calls=0;
 for(const key of ['instanceId','type','condition','builtOnTurn','freeUpkeep']){
  const entry=building();Object.defineProperty(entry,key,{enumerable:true,get(){calls++;return key==='freeUpkeep'?true:100;}});
  assert.throws(()=>writeV2Save(fixture(entry)),/building/i);assert.equal(calls,0);
 }
 const entry={...building(),toJSON(){calls++;return {...building(),freeUpkeep:true};}};
 assert.throws(()=>writeV2Save(fixture(entry)),/building/i);assert.equal(calls,0);
});

test('valid omitted, false and true flags preserve exact saves, charges and RNG',()=>{
 for(const flag of [undefined,false,true]){
  const entry=flag===undefined?building():{...building(),freeUpkeep:flag};
  const state=fixture(entry),before=structuredClone(state),raw=writeV2Save(state),loaded=readV2Save(raw);
  assert.ok(loaded.ok);assert.deepEqual(loaded.state,state);assert.equal(writeV2Save(loaded.state),raw);
  assert.equal(getTotalBuildingUpkeep(loaded.state.buildings),flag===true?0:4);
  assert.deepEqual(state,before);assert.equal(loaded.state.rngState,state.rngState);
 }
});

test('legacy building strings and null-prototype data records stay compatible',()=>{
 for(const entry of ['coal_pit',Object.assign(Object.create(null),building(),{freeUpkeep:false})]){
  const raw=writeV2Save(fixture(entry)),loaded=readV2Save(raw);assert.ok(loaded.ok);
  assert.equal(getTotalBuildingUpkeep(loaded.state.buildings),4);assert.equal(writeV2Save(loaded.state),raw);
 }
});
