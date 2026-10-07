import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import {readLegacySave,readV2Save,writeV2Save} from '../../src/save/saveGame.ts';
const decoded=readV2Save(writeV2Save(gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}})));
if(!decoded.ok)throw new Error(decoded.error);const base=decoded.state,limit=Number.MAX_SAFE_INTEGER;

test('maximum visits advance exactly twice and retain save continuation',()=>{
 const state={...base,tavern:{...base.tavern,totalVisits:limit}},before=structuredClone(state);
 const first=gameReducer(state,{type:'TAVERN_VISIT'});assert.equal(first.tavern.totalVisits,'9007199254740992');assert.equal(first.denarii,700);assert.equal(first.rngState,312129686);
 const raw=writeV2Save(first),loaded=readV2Save(raw);assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),raw);
 const second=gameReducer(loaded.state,{type:'TAVERN_VISIT'});assert.equal(second.tavern.totalVisits,'9007199254740993');assert.equal(readV2Save(writeV2Save(second)).ok,true);assert.deepEqual(state,before);
});

test('wins losses and signed earnings cross precision boundaries without changing payments or draws',()=>{
 const rows=[
  {choice:'sword',earnings:limit,wins:'9007199254740992',losses:limit,net:'9007199254741001',cash:710},
  {choice:'shield',earnings:-limit,wins:limit,losses:'9007199254740992',net:'-9007199254741001',cash:690},
  {choice:'sword',earnings:-limit,wins:'9007199254740992',losses:limit,net:-9007199254740981,cash:710},
  {choice:'shield',earnings:limit,wins:limit,losses:'9007199254740992',net:9007199254740981,cash:690},
 ];
 for(const row of rows){
  const state={...base,tavern:{...base.tavern,gambitTotalWins:limit,gambitTotalLosses:limit,gambitNetEarnings:row.earnings}},before=structuredClone(state);
  const action={type:'TAVERN_GAMBIT_PLAY',payload:{choice:row.choice,wager:10,seed:state.rngState}},next=gameReducer(state,action);
  assert.equal(next.tavern.gambitTotalWins,row.wins);assert.equal(next.tavern.gambitTotalLosses,row.losses);assert.equal(next.tavern.gambitNetEarnings,row.net);assert.equal(next.denarii,row.cash);assert.equal(next.rngState,312129686);
  assert.equal(next.tavern.gambitRoundsThisSeason,1);assert.strictEqual(gameReducer(next,action),next);assert.deepEqual(state,before);
  const raw=writeV2Save(next),loaded=readV2Save(raw);assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),raw);
 }
});

test('canonical large decimal ledger values roundtrip through both save formats',()=>{
 for(const value of ['9007199254740992','9'.repeat(100)]){
  const state={...base,tavern:{...base.tavern,totalVisits:value,gambitTotalWins:value,gambitTotalLosses:value,gambitNetEarnings:'-'+value}};
  const raw=JSON.stringify({format:'lords-ledger',version:2,state});
  for(const loaded of [readV2Save(raw),readLegacySave(JSON.stringify(state))]){assert.ok(loaded.ok);assert.equal(writeV2Save(loaded.state),raw);}
 }
});

test('ambiguous unsafe numbers and noncanonical decimal strings still reject',()=>{
 for(const value of [limit+1,'2','+9007199254740992','09007199254740992','9007199254740992.0','1e16','0x20000000000000','-0',' 9007199254740992']){
  const state={...base,tavern:{...base.tavern,totalVisits:value}};assert.equal(readLegacySave(JSON.stringify(state)).ok,false);assert.throws(()=>writeV2Save(state),/totalVisits/);
 }
 const state={...base,tavern:{...base.tavern,totalVisits:'-9007199254740992'}};assert.equal(readLegacySave(JSON.stringify(state)).ok,false);
});
import {addTavernLedgerInteger,isTavernLedgerInteger,tavernLedgerAtLeast} from '../../src/engine/tavernLedger.ts';
import {WALL_DYNAMIC_CONDITIONS} from '../../src/data/tavern.ts';

test('ledger arithmetic returns numeric encoding inside range and preserves exact large history',()=>{
 assert.equal(addTavernLedgerInteger('9007199254740992',-1),Number.MAX_SAFE_INTEGER);
 assert.equal(addTavernLedgerInteger('-9007199254740992',1),-Number.MAX_SAFE_INTEGER);
 assert.equal(addTavernLedgerInteger(undefined,1,true),1);
 for(const value of [-1,'2','junk',null,{},[]])assert.equal(addTavernLedgerInteger(value,1,true),null);
 assert.equal(addTavernLedgerInteger(0,-1,true),null);assert.equal(addTavernLedgerInteger(0,0.5),null);
 assert.equal(isTavernLedgerInteger('9007199254740992',true),true);assert.equal(isTavernLedgerInteger('-9007199254740992',true),false);
 const comment=WALL_DYNAMIC_CONDITIONS.find(entry=>entry.text.startsWith('BEWARE THE LORD'));assert.ok(comment);
 for(const wins of [0,2,3,4,Number.MAX_SAFE_INTEGER,'9007199254740992','9'.repeat(100)]){
  // The arbitrary string fixture stays at the runtime validator boundary.
  const state={...base,tavern:{...base.tavern,gambitTotalWins:wins}};
  if(isTavernLedgerInteger(wins,true)){assert.equal(comment.condition({...state,tavern:{gambitTotalWins:wins}}),wins!==0&&wins!==2);}
  assert.equal(tavernLedgerAtLeast(wins,3),wins!==0&&wins!==2);
 }
 assert.equal(tavernLedgerAtLeast('junk',3),false);
});
