import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {getAvailableBuyers} from '../../src/data/blacksmith.ts';
import {exportPitchData} from '../../src/data/greatHall.ts';
import {readLegacySave, readV2Save, writeV2Save} from '../../src/save/saveGame.ts';
import {extraField} from '../gameInput.ts';

const start = () => gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
const respond = (responseIndex: number) => gameReducer(start(),
  {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: 'aud_002', responseIndex}});
const buyer = (state: ReturnType<typeof start>) => getAvailableBuyers('spring', state).some(entry => entry.id === 'foreign_merchant');

test('Henrik warm and restricted trade permissions differ from refusal and roundtrip once', () => {
  for (const [index, allowed, meters] of [
    [0, true, {people: 52, treasury: 55, church: 49, military: 50}],
    [1, true, {people: 51, treasury: 53, church: 51, military: 50}],
    [2, false, {people: 49, treasury: 48, church: 52, military: 50}],
  ] as const) {
    const before = start(), raw = writeV2Save(before);
    const state = gameReducer(before, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: 'aud_002', responseIndex: index}});
    assert.equal(buyer(state), allowed);
    assert.equal(extraField(state.greatHall, 'henrikWelcome'), allowed);
    assert.deepEqual(state.greatHall.meters, meters);
    assert.equal(state.denarii, before.denarii);
    assert.equal(state.rngState, before.rngState);
    assert.equal(writeV2Save(before), raw);
    assert.equal(exportPitchData(state).compoundFlags.welcomedHenrik === true, allowed);
    const loaded = readV2Save(writeV2Save(state));
    assert.ok(loaded.ok);
    assert.equal(writeV2Save(loaded.state), writeV2Save(state));
    assert.strictEqual(gameReducer(loaded.state, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: 'aud_002', responseIndex: 0}}), loaded.state);
  }
});

test('Henrik receipt survives dispute and legal seasonal continuation without inferring older resolutions', () => {
  for (const index of [0, 1, 2]) {
    let state = respond(index);
    state = gameReducer(state, {type: 'HALL_RULE_DISPUTE', payload: {disputeId: 'dispute_001', rulingId: 'a'}});
    assert.equal(state.greatHall.rulingHistory?.length, 1);
    for (let season = 0; season < 4; season++) {
      state = gameReducer(state, {type: 'SIMULATE_SEASON', payload: {seasonalEvents: []}});
      if (state.phase === 'raid_warning') {
        state = gameReducer(state, {type: 'RAID_DEFEND'});
        state = gameReducer(state, {type: 'RAID_CONTINUE'});
      }
      state = gameReducer(state, {type: 'CONTINUE_TO_RANDOM', payload: {randomEvents: []}});
      state = gameReducer(state, {type: 'ADVANCE_TURN'});
      assert.equal(buyer(state), index !== 2);
      assert.equal(readV2Save(writeV2Save(state)).ok, true);
    }
    assert.equal(state.turn, 5);
  }
  const legacy = {...respond(0), greatHall: {...respond(0).greatHall}};
  Reflect.deleteProperty(legacy.greatHall, 'henrikWelcome');
  legacy.greatHall.compoundFlags = {};
  assert.equal(buyer(legacy), false);
  assert.equal(readV2Save(writeV2Save(legacy)).ok, true);
});

test('new receipt validation rejects malformed or orphan values and preserves omitted/null defaults', () => {
  for (const value of ['true', 1, {}, [], true, false]) {
    const state = {...start(), greatHall: {...start().greatHall, henrikWelcome: value}};
    const raw = JSON.stringify({format: 'lords-ledger', version: 2, state});
    assert.equal(readV2Save(raw).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state));
  }
  for (const value of [undefined, null]) {
    const state = {...start(), greatHall: {...start().greatHall, henrikWelcome: value}};
    assert.equal(readV2Save(writeV2Save(state)).ok, true);
  }
  for (const allowed of [true, false]) {
    const state = {...start(), greatHall: {...start().greatHall, audienceResolved: ['aud_002'],
      henrikWelcome: allowed, compoundFlags: {welcomedHenrik: !allowed}}};
    assert.equal(readV2Save(JSON.stringify({format: 'lords-ledger', version: 2, state})).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state));
  }
});
