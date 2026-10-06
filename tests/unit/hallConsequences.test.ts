import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
const event = {type:'crisis',text:'Older unrest.',chronicle:'Older record.',effects:{people:-2.5}};
const base = {...createInitialState(104),phase:'management'};
const state = {...base,greatHall:{...base.greatHall,pendingHallEvent:event}};
const command = {type:'HALL_DISMISS_EVENT',payload:{effects:{people:100}}};
test('Hall dismissal rejects wrong phases and invalid consumed state without mutation',()=>{
  for(const phase of ['title','victory','gameover','raid','seasonal_resolve','random_resolve']){
    const blocked={...state,phase};assert.strictEqual(gameReducer(blocked,command),blocked,phase);
  }
  for(const patch of [{turn:0},{turn:41},{turn:1.5},{season:'rainy'},{year:0},{year:25},{season:'winter'},{year:2},{turn:4}]){
    const blocked={...state,...patch};assert.strictEqual(gameReducer(blocked,command),blocked);
  }
  for(const greatHall of [null, {...state.greatHall,meters:null}, {...state.greatHall,meters:{...state.greatHall.meters,people:NaN}},
    {...state.greatHall,pendingHallEvent:{...event,effects:{people:'broken'}}}, {...state.greatHall,hallLog:[null]}]){
    const blocked={...state,greatHall};assert.strictEqual(gameReducer(blocked,command),blocked);
  }
});
test('Hall dismissal preserves historical partial effects, logs, RNG and replay safety',()=>{
  for(const effects of [undefined,null,{}, {people:-2.5}, {people:-1000,treasury:1000}]){
    const pending={...event,effects},current={...state,greatHall:{...state.greatHall,pendingHallEvent:pending}};
    const before=structuredClone(current),result=gameReducer(current,command);
    assert.deepEqual(current,before);assert.equal(result.rngState,current.rngState);
    assert.equal(result.greatHall.meters.people,Math.max(0,50+(effects?.people??0)));
    assert.equal(result.greatHall.meters.treasury,Math.min(100,50+(effects?.treasury??0)));
    assert.deepEqual(result.greatHall.hallLog.at(-1).consequences,effects??{});
    assert.equal(result.greatHall.hallLog.at(-1).text,event.chronicle);
    assert.strictEqual(gameReducer(result,command),result);
    const loaded=readV2Save(writeV2Save(result));assert.ok(loaded.ok);
    assert.strictEqual(gameReducer(loaded.state,command),loaded.state);
  }
});
import { hallMeterDeltas } from '../../src/engine/hallConsequences.ts';
test('Summary deltas retain zero, fractional, cap and default baselines',()=>{
  const current={people:50,treasury:50,church:50,military:50};
  assert.deepEqual(hallMeterDeltas(current,{people:0,treasury:12.5,church:100,military:50}),{people:50,treasury:37.5,church:-50,military:0});
  assert.deepEqual(hallMeterDeltas(current),{people:0,treasury:0,church:0,military:0});
});

test('Hall dismissal accepts every valid current calendar without changing historical rows',()=>{
  for(let turn=1;turn<=40;turn++){
    const current={...state,turn,year:Math.ceil(turn/4),season:['spring','summer','autumn','winter'][(turn-1)%4]};
    const result=gameReducer(current,command);assert.notStrictEqual(result,current);
    assert.ok(readV2Save(writeV2Save(result)).ok);
  }
});
