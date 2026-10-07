import {extraField} from '../gameInput.ts';
import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { createRandomCursor } from '../../src/engine/random.ts';
import { createScanPlan } from '../../src/engine/watchtowerScan.ts';
import { getMilitaryReadiness } from '../../src/engine/militaryReadiness.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
const counters = ['totalScans', 'totalAnomaliesSpotted', 'totalAnomaliesMissed', 'perfectScans'];
function rejects(watchtower: unknown) {
  const state = { ...base, watchtower }, before = JSON.stringify(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
  assert.throws(() => writeV2Save(state), /Save watchtower/);
  assert.equal(JSON.stringify(state), before);
}
for (const key of counters) for (const [index, value] of ['3', false, [], {}].entries()) {
  test(`saved Watchtower ${key} malformed ${index}`, () => rejects({ ...base.watchtower, [key]: value }));
}
for (const key of ['scannedThisSeason', 'scanScribesNoteSeen', 'rodericScribesNoteSeen']) for (const [index, value] of [0, 'yes', [], {}].entries()) {
  test(`saved Watchtower ${key} malformed ${index}`, () => rejects({ ...base.watchtower, [key]: value }));
}
for (const key of ['criminalRaidBonus', 'scottishRaidBonus', 'raidRequirementReduction']) for (const [index, value] of ['3', false, [], {}].entries()) {
  test(`saved Watchtower warning ${key} malformed ${index}`, () => rejects({ ...base.watchtower, warnings: { [key]: value } }));
}
for (const [index, value] of ['log', {}, [null], [false], ['entry']].entries()) {
  test(`saved Watchtower signal log malformed ${index}`, () => rejects({ ...base.watchtower, signalLog: value }));
}
for (const key of ['season', 'text', 'type']) for (const [index, value] of [42, false, [], {}].entries()) {
  test(`saved Watchtower log ${key} malformed ${index}`, () => rejects({ ...base.watchtower, signalLog: [{ [key]: value }] }));
}
for (const [index, value] of ['2', false, [], {}].entries()) {
  test(`saved Watchtower log year malformed ${index}`, () => rejects({ ...base.watchtower, signalLog: [{ year: value }] }));
}
for (const [index, value] of ['warnings', false, []].entries()) {
  test(`saved Watchtower warnings malformed ${index}`, () => rejects({ ...base.watchtower, warnings: value }));
}
for (const [index, value] of ['merchant', false, []].entries()) {
  test(`saved Watchtower merchant preview malformed ${index}`, () => rejects({ ...base.watchtower, warnings: { merchantPreview: value } }));
}
for (const [index, value] of [42, false, [], {}].entries()) {
  test(`saved Watchtower merchant name malformed ${index}`, () => rejects({ ...base.watchtower, warnings: { merchantPreview: { name: value } } }));
}
for (const value of [undefined, null, 4.5]) test(`historical Watchtower defaults ${String(value)} preserve bytes and scan continuation`, () => {
  const watchtower = { ...Object.fromEntries(counters.map(key => [key, value])), scannedThisSeason: null,
    scanScribesNoteSeen: null, rodericScribesNoteSeen: null, warnings: { criminalRaidBonus: null, scottishRaidBonus: 1.5,
      raidRequirementReduction: null, merchantPreview: { name: null, oldSpecialty: { kept: true } } },
    signalLog: [{ season: 'Historical season' as const, year: null, text: 'Historical lookout', type: null }, {}],
    lastScanResult: { oldRating: { kept: true } }, historicalExtension: { kept: true } };
  const state = { ...base, watchtower }, raw = writeV2Save(state), loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
  if (!loaded.ok) throw new Error(loaded.error); if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(writeV2Save(loaded.state), raw); assert.equal(JSON.stringify(legacy.state), JSON.stringify(state));
  const plan = createScanPlan(createRandomCursor(state.rngState).next);
  const action = { type: 'WATCHTOWER_SCAN_COMPLETE', payload: { scanSeed: state.rngState, foundKeys: plan.anomalies.map(anomaly => anomaly.key) } };
  const next = gameReducer(loaded.state, action);
  assert.equal(next.watchtower.totalScans, (value ?? 0) + 1);
  assert.equal(next.watchtower.perfectScans, (value ?? 0) + 1);
  assert.deepEqual(present(next.watchtower.signalLog, "next.watchtower.signalLog").slice(0, 2), watchtower.signalLog);
  assert.deepEqual(extraField(next.watchtower, 'historicalExtension'), { kept: true });
  assert.notEqual(next.rngState, state.rngState); assert.strictEqual(gameReducer(next, action), next);
  assert.doesNotThrow(() => writeV2Save(next)); assert.equal(writeV2Save(loaded.state), raw);
  assert.equal(getMilitaryReadiness(loaded.state).scottishScoutBonus, 1.5);
});
test('historical null warnings and log preserve empty defaults', () => {
  const state = { ...base, watchtower: { warnings: null, signalLog: null }, blacksmith: { ...base.blacksmith, equipped: null } };
  const raw = writeV2Save(state), loaded = readV2Save(raw); if (!loaded.ok) throw new Error(loaded.error);
  assert.equal(writeV2Save(loaded.state), raw); assert.equal(getMilitaryReadiness(loaded.state).forgeBonus, 0);
  assert.equal(getMilitaryReadiness(loaded.state).criminalScoutBonus, 0);
});
