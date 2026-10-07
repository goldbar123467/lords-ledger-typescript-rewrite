import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import {readV2Save,readLegacySave,writeV2Save} from '../../src/save/saveGame.ts';
import {isSavedChronicle} from '../../src/engine/chronicle.ts';

const initial=()=>gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
test('malformed Chronicle entries are rejected at both save readers',()=>{
 for(const chronicle of [[null],[3],[[]],[{text:{lost:'wording'}}],[{text:'Old text',season:3}],[{text:'Old text',year:{}}],[{text:'Old text',turn:'one'}],[{text:'Old text',type:[]}]] ){
  const state={...initial(),chronicle},raw=JSON.stringify(state);
  for(const result of [readLegacySave(raw),readV2Save(JSON.stringify({format:'lords-ledger',version:2,state}))]){
   assert.equal(result.ok,false,raw);if(!result.ok)assert.match(result.error,/chronicle/i);
  }
 }
});
test('writer rejects Chronicle getters, hidden metadata and serializers without invoking them',()=>{
 let calls=0;
 const getter={get text(){calls++;return 'Getter wording';}};
 const hidden=Object.defineProperty({text:'Hidden date'},'year',{value:2,enumerable:false});
 const serializer={text:'Original wording',toJSON(){calls++;return {text:'Changed wording'};}};
 const inherited:object=Object.create({text:'Inherited wording'});
 for(const entry of [getter,hidden,serializer,inherited]){
  const chronicle=[entry];assert.equal(isSavedChronicle(chronicle),false);
  assert.throws(()=>writeV2Save({...initial(),chronicle}),/chronicle/i);
 }
 assert.equal(calls,0);
});
test('Chronicle validation rejects sparse arrays and nonfinite or structured metadata',()=>{
 const sparse:unknown[]=[];sparse.length=1;
 for(const chronicle of [sparse,[{text:'Lost number',year:Infinity}],[{text:'Lost turn',turn:NaN}],[{text:'Wrong kind',type:{}}],[{text:'Wrong season',season:[]}]] ){
  assert.equal(isSavedChronicle(chronicle),false);assert.throws(()=>writeV2Save({...initial(),chronicle}),/chronicle/i);
 }
});
test('null-prototype data records and empty Chronicle wording retain compatible bytes',()=>{
 const record:Record<string,unknown>=Object.assign(Object.create(null),{text:'',type:'older kind',season:'older season' as const,year:0,turn:-1});
 const state={...initial(),chronicle:[record]};assert.equal(isSavedChronicle(state.chronicle),true);
 const raw=writeV2Save(state),loaded=readV2Save(raw);assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),raw);assert.equal(record.text,'');
});
test('historical Chronicle wording, unknown keys and optional metadata round trip literally',()=>{
 const chronicle=[{text:'An older entry.'},{text:'Unknown season and kind.',season:'flood season' as const,year:2.5,type:'constructor',turn:null,annotation:{scribe:'Older hand'}},{text:'Prototype caption.',type:'__proto__',season:null,year:null}];
 const state={...initial(),chronicle},before=structuredClone(state),raw=writeV2Save(state),result=readV2Save(raw);
 assert.ok(result.ok);assert.deepEqual(result.state,state);assert.deepEqual(state,before);assert.equal(writeV2Save(result.state),raw);
});
