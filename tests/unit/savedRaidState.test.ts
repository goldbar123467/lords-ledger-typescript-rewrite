import {extraField} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
const counters = ['lastRaidTurn', 'criminalCooldown', 'scottishCooldown', 'totalCriminalRaids', 'totalScottishRaids',
  'criminalVictories', 'scottishVictories', 'criminalDefeats', 'scottishDefeats', 'totalDenariiLost', 'totalFoodLost', 'totalDenariiRecovered'];
const badValues = ['3', false, [], {}];
const result = { victory: true, partial: false, defenseRatio: 1, denariiDelta: 0, foodDelta: 0, populationDelta: 0,
  garrisonDelta: 0, tradeGoodLost: null, narrativeLine: 'Historical defense', raidName: 'Historical Outlaws' };
for (const key of counters) for (const [index, value] of badValues.entries()) test(`raid ${key} bad value ${index} rejects`, () => {
  const state = { ...base, raids: { ...base.raids, [key]: value } }, before = JSON.stringify(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false); assert.throws(() => writeV2Save(state), /Save raid/);
  assert.equal(JSON.stringify(state), before);
});
for (const key of ['criminalScribesNoteSeen', 'scottishScribesNoteSeen']) for (const [index, value] of [0, 'yes', [], {}].entries()) {
  test(`raid ${key} bad value ${index} rejects`, () => {
    const state = { ...base, raids: { ...base.raids, [key]: value } };
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false); assert.throws(() => writeV2Save(state), /Save raid/);
  });
}
for (const value of ['viking', 42]) test(`unknown historical raid type ${value} rejects`, () => {
  const state = { ...base, raids: { ...base.raids, lastRaidType: value } };
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false); assert.throws(() => writeV2Save(state), /Save raid/);
});
for (const key of ['defenseThreshold', 'watchtowerBonus']) for (const [index, value] of badValues.entries()) {
  test(`captured raid ${key} bad value ${index} rejects`, () => {
    const state = { ...base, phase: 'raid_result' as const, raids: { ...base.raids, activeRaid: { type: 'criminal', phase: 'result' as const, result, [key]: value } } };
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false); assert.throws(() => writeV2Save(state), /Save raid/);
  });
}
for (const value of [undefined, null, 4.5]) test(`historical raid defaults ${String(value)} preserve bytes and continuation`, () => {
  const raids = { ...Object.fromEntries(counters.map(key => [key, value])), lastRaidType: null,
    criminalScribesNoteSeen: null, scottishScribesNoteSeen: null, historicalExtension: { kept: true },
    activeRaid: { type: 'criminal', phase: 'result' as const, result, defenseThreshold: null, watchtowerBonus: 1.5 } };
  const state = { ...base, phase: 'raid_result' as const, raids }, raw = writeV2Save(state), loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
  if (!loaded.ok) throw new Error(loaded.error); if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(JSON.stringify(loaded.state), JSON.stringify(state)); assert.equal(JSON.stringify(legacy.state), JSON.stringify(state));
  assert.equal(writeV2Save(loaded.state), raw);
  const next = gameReducer(loaded.state, { type: 'RAID_CONTINUE' });
  assert.equal(next.raids.totalCriminalRaids, (value ?? 0) + 1);
  assert.equal(next.rngState, state.rngState); assert.deepEqual(extraField(next.raids, 'historicalExtension'), { kept: true });
  assert.doesNotThrow(() => writeV2Save(next)); assert.equal(writeV2Save(loaded.state), raw);
});
