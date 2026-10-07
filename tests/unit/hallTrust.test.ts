import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustTier, exportPitchData } from '../../src/data/greatHall.ts';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import disputes from '../../src/data/disputes.ts';
import { COUNCIL_TOPICS } from '../../src/data/decrees.ts';

test('fractional trust retains the last reached integer tier threshold', () => {
  for (const [trust, label] of [[0,'Wary'],[30,'Wary'],[30.99,'Wary'],[31,'Cautious'],[50.99,'Cautious'],[51,'Respectful'],[70.99,'Respectful'],[71,'Devoted'],[85.99,'Devoted'],[86,'Bonded'],[100,'Bonded']] as const) assert.equal(getTrustTier(trust).label, label, String(trust));
});

test('pitch export preserves zero and fractional trust with nullish compatibility defaults', () => {
  for (const trust of [0,.5,30.5,50.5,85.5,100]) assert.equal(exportPitchData({greatHall:{stewardTrust:trust}}).stewardTrust, trust);
  assert.equal(exportPitchData({}).stewardTrust,50);
  assert.equal(exportPitchData({greatHall:{stewardTrust:null}}).stewardTrust,50);
});

test('Hall rewards preserve zero and fractional trust through save continuation', () => {
  const dispute=disputes[0], ruling=dispute?.rulings[0], topic=COUNCIL_TOPICS[0], option=topic?.options[0];
  if (!dispute || !ruling) throw new Error('Missing authored dispute choice');
  if (!topic || !option) throw new Error('Missing authored council choice');
  for (const trust of [0,.5,30.5,50.5,85.5,99,100]) {
    const base=createInitialState(104);
    const state={...base,phase:'management' as const,greatHall:{...base.greatHall,stewardTrust:trust,meters:{...base.greatHall.meters,people:71}}};
    const before=structuredClone(state);
    const cases: readonly {action:{type:string;payload:object};gain:number}[]=[
      {action:{type:'HALL_AUDIENCE_RESPOND',payload:{encounterId:'aud_001',responseIndex:0}},gain:1},
      {action:{type:'HALL_RULE_DISPUTE',payload:{disputeId:dispute.id,rulingId:ruling.id,consequences:ruling.consequences,decree:ruling.decree}},gain:2},
      {action:{type:'HALL_COUNCIL_VOTE',payload:{topicId:topic.id,optionId:option.id,consequences:option.consequences}},gain:1},
      {action:{type:'HALL_FEAST_COMPLETE',payload:{guestId:'village',entertainmentId:'musicians',courseId:'modest',seed:state.rngState}},gain:3},
    ];
    for (const {action,gain} of cases) {
      const result=gameReducer(state,action);
      assert.equal(result.greatHall.stewardTrust,Math.min(100,trust+gain),action.type);
      const loaded=readV2Save(writeV2Save(result)); if (!loaded.ok) throw new Error(loaded.error);
      assert.deepEqual(loaded.state.greatHall,result.greatHall); assert.equal(loaded.state.rngState,result.rngState);
      assert.deepEqual(state,before);
    }
  }
});

test('inactive season decay keeps zero at zero and subtracts exactly two from fractions', () => {
  for (const trust of [0,.5,2,30.5,50.5,85.5,100]) {
    const base=createInitialState(104);
    const state={...base,phase:'random_resolve' as const,greatHall:{...base.greatHall,stewardTrust:trust}};
    const before=structuredClone(state), result=gameReducer(state,{type:'ADVANCE_TURN'});
    assert.equal(result.turn,state.turn+1);
    assert.equal(result.greatHall.stewardTrust,Math.max(0,trust-2)); assert.deepEqual(state,before);
  }
});
