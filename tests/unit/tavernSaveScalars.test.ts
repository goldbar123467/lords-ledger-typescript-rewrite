import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import {readLegacySave,readV2Save,writeV2Save} from '../../src/save/saveGame.ts';

const decoded=readV2Save(writeV2Save(gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}})));
if(!decoded.ok)throw new Error(decoded.error);
const base=decoded.state;
const flags=['gambitScribesNoteSeen','ratsScribesNoteSeen','wallStashFound'] as const;
const counts=['totalVisits','gambitTotalWins','gambitTotalLosses'] as const;
const fields=[...flags,...counts,'gambitNetEarnings'] as const;
const fixture=(key:string,value:unknown)=>({...base,tavern:{...base.tavern,[key]:value}});

for(const field of fields)test(`Tavern save rejects malformed ${field} at both readers and writer`,()=>{
 const values:readonly unknown[]=flags.some(key=>key===field)?['yes',0,1,null,{},[]]:['2',null,{},[],0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,...(field==='gambitNetEarnings'?[]:[-1])];
 for(const value of values){
  const state=fixture(field,value),raw=JSON.stringify(state);
  for(const result of [readLegacySave(raw),readV2Save(JSON.stringify({format:'lords-ledger',version:2,state}))]){
   assert.equal(result.ok,false,`${field}: ${String(value)}`);if(!result.ok)assert.match(result.error,new RegExp(field));
  }
  assert.throws(()=>writeV2Save(state),new RegExp(field));assert.equal(JSON.stringify(state),raw);
 }
});

test('Tavern optional valid and omitted scalars preserve canonical saves and legacy imports',()=>{
 const tavern={...base.tavern};for(const field of fields)Reflect.deleteProperty(tavern,field);
 for(const extra of [{},{gambitScribesNoteSeen:false,ratsScribesNoteSeen:false,wallStashFound:false,totalVisits:0,gambitTotalWins:0,gambitTotalLosses:0,gambitNetEarnings:0},{gambitScribesNoteSeen:true,ratsScribesNoteSeen:true,wallStashFound:true,totalVisits:2,gambitTotalWins:1,gambitTotalLosses:2,gambitNetEarnings:-125}]){
  const state={...base,tavern:{...tavern,...extra}},raw=writeV2Save(state);
  for(const result of [readV2Save(raw),readLegacySave(JSON.stringify(state))]){assert.ok(result.ok);assert.deepEqual(result.state,state);assert.equal(writeV2Save(result.state),raw);}
 }
});

test('Tavern consumed scalar descriptors and serializer reject before getters run',()=>{
 let calls=0;
 for(const field of fields){const tavern={...base.tavern};Object.defineProperty(tavern,field,{enumerable:true,get(){calls++;return flags.some(key=>key===field)?true:0;}});assert.throws(()=>writeV2Save({...base,tavern}),/tavern/i);assert.equal(calls,0);}
 const tavern={...base.tavern,toJSON(){calls++;return base.tavern;}};assert.throws(()=>writeV2Save({...base,tavern}),/tavern/i);assert.equal(calls,0);
});

test('Tavern hidden and inherited consumed scalars reject while null prototypes and extensions remain compatible',()=>{
 for(const field of fields){const tavern={...base.tavern};Object.defineProperty(tavern,field,{value:flags.some(key=>key===field)?true:0,enumerable:false});assert.throws(()=>writeV2Save({...base,tavern}),/tavern/i);}
 const inherited:object=Object.assign(Object.create({totalVisits:2}),base.tavern);Reflect.deleteProperty(inherited,'totalVisits');assert.throws(()=>writeV2Save({...base,tavern:inherited}),/tavern/i);
 const tavern:object=Object.assign(Object.create(null),base.tavern,{future:{note:'retained'},toJSON:42});const state={...base,tavern};const raw=writeV2Save(state),loaded=readV2Save(raw);assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),raw);
});
