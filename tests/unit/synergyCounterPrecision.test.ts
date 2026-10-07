import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { advanceSynergyCounters, checkTierConditions } from '../../src/engine/synergyEngine.ts';
import { SYNERGY_TIER_MAP } from '../../src/data/synergies.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
const maximum = Number.MAX_SAFE_INTEGER;
test('accepted maximum sustained counters advance twice and remain saveable', () => {
  const state = { ...base, phase: 'random_resolve', chapel: { ...base.chapel, faith: 80 },
    greatHall: { ...base.greatHall, meters: { ...base.greatHall.meters, people: 80 } },
    synergies: { ...base.synergies, highFaithTurns: maximum, highPeopleTurns: maximum } }, before = JSON.stringify(state);
  assert.equal(readV2Save(writeV2Save(state)).ok, true);
  const first = gameReducer(state, { type: 'ADVANCE_TURN' });
  assert.equal(first.turn, 2); assert.equal(first.phase, 'management');
  assert.equal(first.synergies.highFaithTurns, '9007199254740992');
  assert.equal(first.synergies.highPeopleTurns, '9007199254740992');
  const raw = writeV2Save(first), loaded = readV2Save(raw); if (!loaded.ok) throw new Error(loaded.error);
  assert.equal(writeV2Save(loaded.state), raw);
  const second = advanceSynergyCounters(loaded.state.synergies, { taxRate: 'low', food: 200, faith: 80, peopleApproval: 80 });
  assert.equal(second.highFaithTurns, '9007199254740993'); assert.equal(second.highPeopleTurns, '9007199254740993');
  assert.doesNotThrow(() => writeV2Save({ ...loaded.state, synergies: second })); assert.equal(JSON.stringify(state), before);
});
for (const encoded of ['9007199254740992', '9'.repeat(100)]) test(`canonical sustained count ${encoded.length} digits preserves exact arithmetic and reset`, () => {
  const state = { ...base, synergies: { ...base.synergies, highFaithTurns: encoded, highPeopleTurns: encoded } };
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state });
  for (const result of [readV2Save(raw), readLegacySave(JSON.stringify(state))]) {
    if (!result.ok) throw new Error(result.error);
    assert.equal(writeV2Save(result.state), raw);
    const next = advanceSynergyCounters(result.state.synergies, { taxRate: 'low', food: 200, faith: 80, peopleApproval: 80 });
    assert.equal(next.highFaithTurns, (BigInt(encoded) + 1n).toString()); assert.equal(next.highPeopleTurns, next.highFaithTurns);
    assert.doesNotThrow(() => writeV2Save({ ...result.state, synergies: next }));
    const reset = advanceSynergyCounters(next, { taxRate: 'high', food: 0, faith: 0, peopleApproval: 0 });
    assert.equal(reset.highFaithTurns, 0); assert.equal(reset.highPeopleTurns, 0);
    const pious = SYNERGY_TIER_MAP.pious_lord_2?.tier; if (!pious) throw new Error('Pious tier missing.');
    assert.equal(checkTierConditions({ ...pious, conditions: { highFaithTurns: 3 } }, { chapel: { faith: 80 }, synergies: result.state.synergies }), true);
    assert.equal(checkTierConditions({ ...pious, conditions: { highPeopleTurns: 4 } }, { greatHall: { meters: { people: 80 } }, synergies: result.state.synergies }), true);
  }
});
for (const value of [maximum + 1, '2', '+9007199254740992', '09007199254740992', '9007199254740992.0', '1e16', '-9007199254740992']) {
  test(`noncanonical sustained count ${String(value)} rejects`, () => {
    const state = { ...base, synergies: { ...base.synergies, highFaithTurns: value, highPeopleTurns: value } };
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
    assert.throws(() => writeV2Save(state), /Save synergy/);
  });
}
