import assert from 'node:assert/strict';import test from 'node:test';import {createInitialState,gameReducer} from '../../src/engine/gameReducer.js';import {readV2Save,writeV2Save} from '../../src/save/saveGame.ts';
const base=()=>({...createInitialState(104),phase:'management'}),visit={type:'BLACKSMITH_VISIT'};
test('Forge visit preserves zero respect and is consumed once per saved turn',()=>{
 const initial=base(),state={...initial,blacksmith:{...initial.blacksmith,godricRespect:0}},next=gameReducer(state,visit);
 assert.equal(next.blacksmith.godricRespect,1);assert.equal(next.blacksmith.lastVisitTurn,1);assert.equal(gameReducer(next,visit),next);assert.equal(next.rngState,state.rngState);
 const loaded=readV2Save(writeV2Save(next));assert.ok(loaded.ok);if(loaded.ok)assert.equal(gameReducer(loaded.state,visit),loaded.state);
});
test('Forge visit retains absence penalty and fractional/clamped respect across valid calendars',()=>{
 for(let turn=1;turn<=40;turn++)for(const respect of [0,0.5,50,99.5,100])for(const last of [0,Math.max(0,turn-1),Math.max(0,turn-3),turn]){
  const initial=base(),state={...initial,turn,year:Math.ceil(turn/4),season:['spring','summer','autumn','winter'][(turn-1)%4],blacksmith:{...initial.blacksmith,godricRespect:respect,lastVisitTurn:last}},next=gameReducer(state,visit);
  if(last===turn){assert.equal(next,state);continue;}assert.equal(next.blacksmith.godricRespect,Math.max(0,Math.min(100,respect+(last>0&&turn-last>=3?-3:1))));assert.equal(next.blacksmith.lastVisitTurn,turn);assert.equal(next.rngState,state.rngState);
 }
});
test('Forge visit rejects invalid phase/calendar/consumed values and keeps nullish legacy defaults',()=>{
 const initial=base();for(const patch of [{phase:'victory'},{phase:'title'},{turn:0},{turn:41},{year:25},{season:'winter'},...[NaN,Infinity,-1,101,'0'].map(godricRespect=>({blacksmith:{...initial.blacksmith,godricRespect}})),...[-1,1.5,2,NaN,'0'].map(lastVisitTurn=>({blacksmith:{...initial.blacksmith,lastVisitTurn}}))]){const state={...initial,...patch};assert.equal(gameReducer(state,visit),state);}
 for(const blacksmith of [undefined,null,{}, {godricRespect:null,lastVisitTurn:null}]){const state={...initial,blacksmith},next=gameReducer(state,visit);assert.equal(next.blacksmith.godricRespect,51);assert.equal(next.blacksmith.lastVisitTurn,1);}
});
