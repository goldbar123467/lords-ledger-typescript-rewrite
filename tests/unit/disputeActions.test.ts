import type {GameSnapshot} from '../../src/save/saveGame.ts';
import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import disputes from '../../src/data/disputes.ts';
import {readV2Save,writeV2Save} from '../../src/save/saveGame.ts';
const state=()=>({...createInitialState(104),phase:'management' as const});
const command={type:'HALL_RULE_DISPUTE',payload:{disputeId:'dispute_001',rulingId:'a'}};

test('invalid dispute commands and phases are exact no-ops',()=>{
  const base=state();
  for(const payload of [undefined,null,[],{}, {disputeId:'invented',rulingId:'a',consequences:{people:100}}, {disputeId:'dispute_001',rulingId:'invented'}, {disputeId:'dispute_001',rulingId:0}, {disputeId:'dispute_002',rulingId:'a'}, {disputeId:'dispute_016',rulingId:'a'}])assert.strictEqual(gameReducer(base,{type:command.type,payload}),base);
  for(const phase of ['title','victory','gameover','seasonal_resolve','random_resolve','raid']){
    const blocked={...base,phase};assert.strictEqual(gameReducer(blocked,command),blocked);
  }
});

test('dispute effects and recorded prose come from the authored ruling',()=>{
  const base=state(),before=structuredClone(base),ruling=disputes[0].rulings[0];
  const result=gameReducer(base,{type:command.type,payload:{...command.payload,consequences:{people:100,treasury:100,church:100,military:100},decree:'Injected'}});
  assert.deepEqual(result.greatHall.meters,{people:55,treasury:48,church:50,military:50});
  assert.equal(present(present(result.greatHall.rulingHistory, "result.greatHall.rulingHistory")[0], "present(result.greatHall.rulingHistory, \"result.greatHall.rulingHistory\")[0]").decree,ruling.decree);assert.deepEqual(present(present(result.greatHall.rulingHistory, "result.greatHall.rulingHistory")[0], "present(result.greatHall.rulingHistory, \"result.greatHall.rulingHistory\")[0]").consequences,ruling.consequences);
  assert.deepEqual(base,before);assert.equal(result.rngState,base.rngState);
});

test('a resolved dispute cannot be replayed, including after Save/Load',()=>{
  const result=gameReducer(state(),command);assert.equal(result.greatHall.disputesResolved,1);
  assert.strictEqual(gameReducer(result,command),result);
  const loaded=readV2Save(writeV2Save(result));if(!loaded.ok)throw new Error(loaded.error);
  assert.strictEqual(gameReducer(loaded.state,command),loaded.state);
});

test('all 16 authored disputes become reachable as completed cases leave the queue',()=>{
  let current: GameSnapshot=state();const seen=new Set<string>();
  for(let season=0;season<4;season++){
    for(;;){
      const next=disputes.find(d=>(d.season==='any'||d.season===current.season)&&!seen.has(d.id));if(!next)break;
      const result=gameReducer(current,{type:command.type,payload:{disputeId:next.id,rulingId:next.rulings[0].id}});
      assert.notStrictEqual(result,current);seen.add(next.id);current=result;
    }
    current=gameReducer({...current,phase:'seasonal_resolve' as const},{type:'ADVANCE_TURN'});
  }
  assert.equal(seen.size,16);assert.equal(present(current.greatHall.rulingHistory, "current.greatHall.rulingHistory").length,16);assert.equal(current.greatHall.disputesResolved,16);
});
