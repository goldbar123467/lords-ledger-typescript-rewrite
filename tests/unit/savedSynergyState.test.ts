import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { advanceSynergyCounters, checkSynergies } from '../../src/engine/synergyEngine.ts';
import { isActivatedSynergies } from '../../src/engine/marketHaggle.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
function rejects(synergies: unknown) {
  const state = { ...base, synergies }, before = JSON.stringify(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
  assert.throws(() => writeV2Save(state), /Save synergy/);
  assert.equal(JSON.stringify(state), before);
}
for (const key of ['woolTrades', 'spicePurchases']) for (const [index, value] of [undefined, null, '3', false, [], {}].entries()) {
  test(`saved synergy required ${key} malformed ${index}`, () => rejects({ ...base.synergies, [key]: value }));
}
for (const key of ['lowTaxTurns', 'foodSurplusTurns']) for (const [index, value] of ['3', false, [], {}].entries()) {
  test(`saved synergy seasonal ${key} malformed ${index}`, () => rejects({ ...base.synergies, [key]: value }));
}
for (const [index, value] of [undefined, null, 'grain', {}, [null], [42], [[]]].entries()) {
  test(`saved synergy trade types malformed ${index}`, () => rejects({ ...base.synergies, tradeTypes: value }));
}
for (const [index, value] of [0, 'false', [], {}].entries()) {
  test(`saved synergy revolt flag malformed ${index}`, () => rejects({ ...base.synergies, revoltTriggered: value }));
}
test('activated synergy predicate rejects sparse arrays', () => assert.equal(isActivatedSynergies(Array(1)), false));
for (const value of [undefined, null, -3.5, 0, 4.5]) test(`historical seasonal counter ${String(value)} retains bytes and defaults`, () => {
  const state = { ...base, synergies: { ...base.synergies, lowTaxTurns: value, foodSurplusTurns: value,
    revoltTriggered: null, tradeTypes: ['old-resource', 'grain', 'grain'], woolTrades: 4.5, spicePurchases: 2.5,
    historicalExtension: { kept: true } } };
  const raw = writeV2Save(state), loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
  if (!loaded.ok) throw new Error(loaded.error); if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(writeV2Save(loaded.state), raw); assert.equal(JSON.stringify(legacy.state), JSON.stringify(state));
  const next = advanceSynergyCounters(loaded.state.synergies, { taxRate: 'low', food: 200, faith: 0, peopleApproval: 0 });
  const seasonalCounters: readonly number[] = [next.lowTaxTurns, next.foodSurplusTurns, next.highFaithTurns, next.highPeopleTurns];
  assert.equal(seasonalCounters.length, 4);
  assert.equal(next.lowTaxTurns, (value ?? 0) + 1); assert.equal(next.foodSurplusTurns, (value ?? 0) + 1);
  assert.deepEqual(checkSynergies(loaded.state), checkSynergies(state));
  const sold = gameReducer(loaded.state, { type: 'SELL_RESOURCE', payload: { resource: 'grain', quantity: 1 } });
  assert.equal(sold.synergies.woolTrades, 4.5); assert.deepEqual(sold.synergies.tradeTypes, state.synergies.tradeTypes);
  assert.equal(sold.rngState, state.rngState); assert.doesNotThrow(() => writeV2Save(sold));
  assert.equal(writeV2Save(loaded.state), raw);
});
test('valid fractional wool trade and spice purchase keep numeric arithmetic', () => {
  const state = { ...base, inventory: { ...base.inventory, wool: 2 }, synergies: { ...base.synergies, woolTrades: 4.5, spicePurchases: 2.5 } };
  const sold = gameReducer(state, { type: 'SELL_RESOURCE', payload: { resource: 'wool', quantity: 1 } });
  assert.equal(sold.synergies.woolTrades, 5.5);
  const bought = gameReducer(sold, { type: 'BUY_RESOURCE', payload: { resource: 'spices', quantity: 1 } });
  assert.equal(bought.synergies.spicePurchases, 3.5);
  assert.deepEqual(bought.synergies.tradeTypes, ['wool', 'spices']); assert.doesNotThrow(() => writeV2Save(bought));
});
