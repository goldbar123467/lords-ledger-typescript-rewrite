import assert from 'node:assert/strict';
import test from 'node:test';
import encounters from '../../src/data/audience.ts';
import {computeCompoundFlags, exportPitchData} from '../../src/data/greatHall.ts';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {readLegacySave, readV2Save, writeV2Save} from '../../src/save/saveGame.ts';
import {extraField} from '../gameInput.ts';

const cases = [
  {id: 'aud_006', field: 'edwinFunding', flag: 'fundedEdwin', selected: [0], alias: 'edwin_tinker', effects: {treasury: -3}},
  {id: 'aud_009', field: 'scriptoriumGrant', flag: 'grantedScriptorium', selected: [0, 1], alias: 'brother_marcus', effects: {church: 5}},
  {id: 'aud_010', field: 'poacherPenalty', flag: 'harshOnPoacher', selected: [1], alias: 'giles_poacher', effects: {people: -8}},
] as const;
const start = () => gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
function before(id: string) {
  let state = start();
  for (const encounter of encounters) {
    if (encounter.id === id) break;
    state = gameReducer(state, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: encounter.id, responseIndex: 0}});
  }
  return state;
}
function roundtrip(state: ReturnType<typeof start>) {
  const raw = writeV2Save(state), loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
  assert.ok(loaded.ok); assert.ok(legacy.ok);
  assert.equal(writeV2Save(loaded.state), raw); assert.equal(writeV2Save(legacy.state), raw);
  return loaded.state;
}

for (const item of cases) for (const responseIndex of [0, 1, 2]) {
  test(`${item.id} response ${responseIndex} persists only its selected feedback through dispute and season`, () => {
    const input = before(item.id), raw = writeV2Save(input);
    let state = gameReducer(input, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: item.id, responseIndex}});
    const selected = item.selected.some(index => index === responseIndex);
    assert.equal(extraField(state.greatHall, item.field), selected);
    assert.equal(state.greatHall.compoundFlags?.[item.flag] === true, selected);
    assert.equal(exportPitchData(state).compoundFlags[item.flag] === true, selected);
    assert.equal(state.denarii, input.denarii); assert.equal(state.rngState, input.rngState);
    assert.equal(writeV2Save(input), raw);
    state = roundtrip(state);
    assert.strictEqual(gameReducer(state, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: item.id, responseIndex: 0}}), state);
    state = gameReducer(state, {type: 'HALL_RULE_DISPUTE', payload: {disputeId: 'dispute_001', rulingId: 'a'}});
    for (let season = 0; season < 4; season++) {
      state = gameReducer(state, {type: 'SIMULATE_SEASON', payload: {seasonalEvents: []}});
      if (state.phase === 'raid_warning') {
        state = gameReducer(state, {type: 'RAID_DEFEND'});
        state = gameReducer(state, {type: 'RAID_CONTINUE'});
      }
      state = gameReducer(state, {type: 'CONTINUE_TO_RANDOM', payload: {randomEvents: []}});
      state = gameReducer(state, {type: 'ADVANCE_TURN'});
      assert.equal(state.greatHall.compoundFlags?.[item.flag] === true, selected);
      assert.equal(exportPitchData(state).compoundFlags[item.flag] === true, selected);
      roundtrip(state);
    }
    assert.equal(state.turn, 5);
  });
}

test('feedback receipts reject malformed, orphan and cache-contradictory saves through both readers and writer', () => {
  for (const item of cases) for (const value of [true, false, 'true', 1, {}, []]) {
    const state = {...start(), greatHall: {...start().greatHall, [item.field]: value}};
    assert.equal(readV2Save(JSON.stringify({format: 'lords-ledger', version: 2, state})).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state));
  }
  for (const item of cases) for (const value of [true, false]) {
    const state = {...start(), greatHall: {...start().greatHall, audienceResolved: [item.id],
      [item.field]: value, compoundFlags: {[item.flag]: !value}}};
    assert.equal(readV2Save(JSON.stringify({format: 'lords-ledger', version: 2, state})).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state));
  }
});

test('older omitted/null responses stay unknown; real refusal overrides cached feedback without rewriting history', () => {
  for (const item of cases) {
    assert.equal(extraField(start().greatHall, item.field), undefined);
    for (const value of [undefined, null]) {
      const state = {...start(), greatHall: {...start().greatHall, audienceResolved: [item.id], [item.field]: value}};
      roundtrip(state);
      assert.equal(exportPitchData(state).compoundFlags[item.flag], undefined);
    }
    const input = before(item.id), cached = {...input, greatHall: {...input.greatHall,
      compoundFlags: {...input.greatHall.compoundFlags, [item.flag]: true, ironRule: true}}};
    roundtrip(cached);
    const index = item.id === 'aud_010' ? 0 : 2;
    const after = gameReducer(cached, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: item.id, responseIndex: index}});
    assert.equal(after.greatHall.compoundFlags?.[item.flag], undefined);
    assert.equal(after.greatHall.compoundFlags?.ironRule, true);
    roundtrip(after);
    assert.equal(computeCompoundFlags([{disputeId: item.alias, consequences: item.effects}])[item.flag], true);
    assert.equal(computeCompoundFlags([{disputeId: item.alias, consequences: item.effects}], {[item.field]: false})[item.flag], undefined);
  }
});
