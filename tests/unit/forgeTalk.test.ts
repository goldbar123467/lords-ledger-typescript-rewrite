import {assertGameSnapshot} from '../../src/save/saveGame.ts';
import type {GameSnapshot} from '../../src/save/saveGame.ts';
import assert from 'node:assert/strict';import test from 'node:test';import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';import {createRandomCursor,seedLegacySnapshot} from '../../src/engine/random.ts';import {writeV2Save,readV2Save} from '../../src/save/saveGame.ts';
test('Godric Talk advances one saved draw on both chance outcomes and preserves all unrelated state',()=>{
 let triggered=0,quiet=0;for(let seed=0;seed<100;seed++){const initial=createInitialState(104),state={...initial,phase:'management' as const,rngState:seed},cursor=createRandomCursor(seed),chance=cursor.next()<0.3,next=gameReducer(state,{type:'BLACKSMITH_TALK'});assert.notEqual(next,state);assert.equal(next.rngState,cursor.state);assert.equal(next.blacksmith.banterIndex,state.blacksmith.banterIndex+(chance?1:0));assert.deepEqual(next,{...state,rngState:cursor.state,...(chance?{blacksmith:{...state.blacksmith,banterIndex:state.blacksmith.banterIndex+1}}:{})});if(chance)triggered++;else quiet++;}assert.ok(triggered>0&&quiet>0);
});
test('Talk sequence resumes exactly from Save/Load and gives old snapshots a deterministic stream',()=>{
 const state={...createInitialState(104),phase:'management' as const};let left: GameSnapshot=state,right: GameSnapshot=state;for(let i=0;i<30;i++){left=gameReducer(left,{type:'BLACKSMITH_TALK'});right=gameReducer(right,{type:'BLACKSMITH_TALK'});assert.equal(writeV2Save(left),writeV2Save(right));const loaded=readV2Save(writeV2Save(right));assert.equal(loaded.ok,true);if(!loaded.ok)throw Error('Roundtrip failed');right=gameReducer(right,{type:'LOAD_SAVE',payload:{savedState:loaded.state}});}
 const {rngState,...legacy}=state;assert.ok(Number.isInteger(rngState));const cursor=createRandomCursor(seedLegacySnapshot(legacy));cursor.next();const next=gameReducer(legacy,{type:'BLACKSMITH_TALK'});assertGameSnapshot(next);assert.equal(next.rngState,cursor.state);assert.deepEqual(gameReducer(legacy,{type:'BLACKSMITH_TALK'}),next);
});
test('Invalid Talk state rejects atomically without consuming RNG or changing counters',()=>{
 const state={...createInitialState(104),phase:'management' as const};for(const patch of [{phase:'title' as const},{phase:'victory' as const},{turn:41},{year:2},{season:'winter' as const},{blacksmith:{...state.blacksmith,banterIndex:-1}},{blacksmith:{...state.blacksmith,banterIndex:0.5}},{blacksmith:{...state.blacksmith,banterIndex:Number.MAX_SAFE_INTEGER}}]){const invalid={...state,...patch};assert.equal(gameReducer(invalid,{type:'BLACKSMITH_TALK'}),invalid);}
});
