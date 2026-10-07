import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHallConsequenceState } from '../../src/engine/hallConsequenceState.ts';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
const state={...createInitialState(104),phase:'management' as const,activeTab:'hall',tutorialsSeen:['hall']};
const snapshot={turn:0,season:'winter' as const,year:25,meters:{people:0,treasury:12.5,church:100,military:50}};
const event={type:'crisis',meter:'people',text:'Older unrest prose.',chronicle:'Older chronicle.',effects:{people:-2.5}};
function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function damagedRaw(key:string,value:unknown){const envelope:unknown=JSON.parse(writeV2Save(state));if(!record(envelope)||!record(envelope.state)||!record(envelope.state.greatHall))throw Error('Invalid fixture');return {v2:JSON.stringify({...envelope,state:{...envelope.state,greatHall:{...envelope.state.greatHall,[key]:value}}}),legacy:JSON.stringify({...envelope.state,greatHall:{...envelope.state.greatHall,[key]:value}})};}
const badFields:readonly [string,unknown][]=[
 ['reputation',{}],['reputation',false],['reputationTrack',{}],['reputationTrack','invented_track'],
 ['reputationScores',[]],['reputationScores',{merciful:-1}],['reputationScores',{merciful:'many'}],
 ['meterHistory',{}],['meterHistory',[null,snapshot]],['meterHistory',[{...snapshot,meters:null}]],
 ['meterHistory',[{...snapshot,meters:{...snapshot.meters,people:101}}]],['meterHistory',[{...snapshot,meters:{...snapshot.meters,people:'broken'}}]],
 ['meterHistory',[{...snapshot,season:'rainy' as const}]],['meterHistory',[{...snapshot,year:0}]],['meterHistory',[{...snapshot,turn:-1}]],
 ['compoundFlags',[]],['compoundFlags',{ironRule:'yes'}],['crisisTriggered',true],['crisisTriggered',{people:1}],['peakTriggered',{church:{}}],
 ['pendingHallEvent',[]],['pendingHallEvent',{...event,type:'other'}],['pendingHallEvent',{...event,text:{}}],
 ['pendingHallEvent',{...event,meter:{}}],['pendingHallEvent',{...event,effects:{people:'broken'}}],['pendingHallEvent',{...event,effects:{foreign:3}}],
 ['pendingHallEvent',{...event,chronicle:{}}],['pendingHallEvent',{...event,text:''}],
];
test('remaining consumed Hall fields reject damaged v2 and legacy records',()=>{
 for(const [key,value]of badFields){const raw=damagedRaw(key,value);assert.equal(readV2Save(raw.v2).ok,false,key);assert.equal(readLegacySave(raw.legacy).ok,false,key);}
});
test('Hall writers refuse malformed consumed shell and consequence fields',()=>{
 for(const [key,value]of badFields)assert.throws(()=>writeV2Save({...state,greatHall:{...state.greatHall,[key]:value}}),Error,key);
});
test('historical Hall prose, fractions, duplicate dated snapshots and safe defaults remain byte-exact',()=>{
 const hall={...state.greatHall,reputation:'A title from an older campaign',reputationTrack:'balanced',reputationScores:{balanced:2.5,merciful:0},
   meterHistory:[snapshot,snapshot],compoundFlags:{ironRule:false,olderFlag:true},crisisTriggered:{people:false},peakTriggered:{church:true},pendingHallEvent:event};
 const saved=writeV2Save({...state,greatHall:hall}),loaded=readV2Save(saved);assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),saved);
 const legacy=readLegacySave(JSON.stringify({...state,greatHall:hall}));assert.ok(legacy.ok);assert.equal(writeV2Save(legacy.state),saved);
 for(const key of ['reputation','reputationTrack','reputationScores','meterHistory','compoundFlags','pendingHallEvent','crisisTriggered','peakTriggered'] as const){
   const missing={...state.greatHall};delete missing[key];const raw=writeV2Save({...state,greatHall:missing});const parsed=readV2Save(raw);assert.ok(parsed.ok,key);assert.equal(writeV2Save(parsed.state),raw);
   const nullable={...state.greatHall,[key]:null};const nullRaw=writeV2Save({...state,greatHall:nullable});const parsedNull=readV2Save(nullRaw);assert.ok(parsedNull.ok,key);assert.equal(writeV2Save(parsedNull.state),nullRaw);
 }
});

test('Hall consequence fields require own serialized consumed values',()=>{
  for(const key of ['reputation','reputationTrack','reputationScores','meterHistory','compoundFlags','pendingHallEvent','crisisTriggered','peakTriggered'] as const){
    const hall={...state.greatHall};const value=hall[key];delete hall[key];Object.setPrototypeOf(hall,{[key]:value});
    assert.notEqual(validateHallConsequenceState(hall),null,key);
    const hidden={...state.greatHall};Object.defineProperty(hidden,key,{enumerable:false});assert.notEqual(validateHallConsequenceState(hidden),null,key);
  }
  for(const key of Object.keys(snapshot)){
    const hidden={...snapshot};Object.defineProperty(hidden,key,{enumerable:false});assert.notEqual(validateHallConsequenceState({meterHistory:[hidden]}),null,key);
  }
  assert.notEqual(validateHallConsequenceState({pendingHallEvent:{...event,effects:Object.create({people:5})}}),null);
  assert.equal(validateHallConsequenceState({pendingHallEvent:{type:'peak',text:'Old peak',meter:'An older caption',chronicle:'',effects:null}}),null);
  assert.equal(validateHallConsequenceState({pendingHallEvent:{type:'crisis',text:'Old crisis'}}),null);
});
