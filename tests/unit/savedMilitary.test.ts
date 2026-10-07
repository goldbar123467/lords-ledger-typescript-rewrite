import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104}});
const counters = ['idleSeasons', 'totalRecruitmentSpending', 'totalUpkeepSpending',
  'totalFortificationSpending', 'soldiersLostToRaids', 'soldiersLostToDesertion'] as const;
for (const field of counters) test(`military ${field} rejects nonnumeric bookkeeping at persistence boundaries`, () => {
  for (const value of ['3', {}, [], true]) {
    const state = {...base, military: {...base.military, [field]: value}};
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.equal(readV2Save(JSON.stringify({format: 'lords-ledger', version: 2, state})).ok, false);
    assert.throws(() => writeV2Save(state), /military/);
  }
  // JSON turns nonfinite numbers into null, which is a supported historical default.
  for (const value of [NaN, Infinity]) assert.throws(() => writeV2Save({
    ...base, military: {...base.military, [field]: value},
  }), /military/);
});
for (const key of ['feudalObligation', 'castleEvolution', 'militaryMorale'] as const) {
  test(`military ${key} note rejects unsupported flag shapes`, () => {
    for (const value of ['false', {}, [], 1]) {
      const state = {...base, military: {...base.military, scribesNoteSeen: {[key]: value}}};
      assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
      assert.equal(readV2Save(JSON.stringify({format: 'lords-ledger', version: 2, state})).ok, false);
      assert.throws(() => writeV2Save(state), /military/);
    }
  });
}
test('older military defaults, fractional counters and opaque metadata retain exact bytes', () => {
  for (const count of [undefined, null, -3.5, 0, 4.5]) {
    const military = {...base.military, historicalExtension: {kept: true}, lastRaidOutcome: {old: 'wording'}};
    const state = {...base, military: {...military, ...Object.fromEntries(counters.map(key => [key, count])),
      scribesNoteSeen: {feudalObligation: null, castleEvolution: false, militaryMorale: true}}};
    const raw = JSON.stringify({format: 'lords-ledger', version: 2, state});
    const loaded = readV2Save(raw); assert.ok(loaded.ok);
    assert.equal(writeV2Save(loaded.state), raw);
    const legacy = readLegacySave(JSON.stringify(state)); assert.ok(legacy.ok);
    assert.equal(writeV2Save(legacy.state), raw);
  }
});
