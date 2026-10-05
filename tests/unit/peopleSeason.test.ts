import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { getInitialTiers } from '../../src/data/people.ts';
import { TAX_RATES } from '../../src/data/economy.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('Seasonal missing-tier defaults match the canonical distribution for actual population', () => {
  for (const population of [4, 20, 30]) {
    const base = { ...createInitialState(104), phase: 'management', population };
    for (const tiers of [undefined, null]) {
      const state = { ...base, people: { tiers } };
      assert.ok(readV2Save(writeV2Save(state)).ok);
      const explicit = { ...base, people: { tiers: getInitialTiers(population) } };
      const next = gameReducer(state, { type: 'SIMULATE_SEASON' });
      const expected = gameReducer(explicit, { type: 'SIMULATE_SEASON' });
      assert.deepEqual(next.people.tiers, expected.people.tiers);
      assert.equal(next.rngState, expected.rngState);
    }
  }
});

test('Real seasonal departure and return preserve authored notices and durable family fields', () => {
  const base = { ...createInitialState(104), phase: 'management' };
  const poor = { ...base, taxRate: 'crushing', people: { ...base.people, laborGarrison: 40, laborChurch: 0,
    notableFamilies: base.people.notableFamilies.map(f => ({ ...f, loyalty: 0 })) } };
  const departed = gameReducer(poor, { type: 'SIMULATE_SEASON' });
  for (const family of departed.people.notableFamilies) {
    if (family.tier === 'serf') { assert.equal(family.present, true); continue; }
    assert.equal(family.present, false); assert.equal(family.turnsGone, 0);
    assert.ok(departed.chronicle.some((entry: { text: string }) => entry.text === family.leaveNarrative));
  }
  const supplied = gameReducer(base, { type: 'BUILD_BUILDING', payload: { buildingId: 'strip_farm' } });
  assert.equal(supplied.buildings.length, base.buildings.length + 1);
  const returning = { ...supplied, turn: 3, season: 'autumn', inventory: { ...supplied.inventory, grain: 50 }, food: 100, population: 4, taxRate: 'low', people: { ...base.people, tiers: getInitialTiers(4), laborGarrison: 0, laborChurch: 15,
    notableFamilies: base.people.notableFamilies.map(f => f.tier === 'serf' ? f : { ...f, present: false, loyalty: 0, turnsGone: 2 }) } };
  assert.ok(readV2Save(writeV2Save(returning)).ok);
  const returned = gameReducer(returning, { type: 'SIMULATE_SEASON' });
  for (const family of returned.people.notableFamilies) {
    assert.equal(family.present, true); assert.equal(family.turnsGone, 0);
    if (family.tier !== 'serf') { assert.equal(family.loyalty, 1); assert.ok(returned.chronicle.some((entry: { text: string }) => entry.text === family.returnNarrative)); }
  }
  assert.ok(readV2Save(writeV2Save(departed)).ok); assert.ok(readV2Save(writeV2Save(returned)).ok);
});

test('Autumn tax history keeps eight entries and the authoritative rate at updated population', () => {
  const base = createInitialState(104);
  for (const taxRate of ['low', 'medium', 'high', 'crushing'] as const) {
    const state = { ...base, phase: 'management', turn: 3, season: 'autumn', taxRate,
      people: { ...base.people, taxHistory: Array.from({ length: 8 }, () => ({ season: 'spring', year: 1, revenue: 0 })) } };
    const before = structuredClone(state), next = gameReducer(state, { type: 'SIMULATE_SEASON' });
    assert.equal(next.people.taxHistory.length, 8);
    assert.deepEqual(next.people.taxHistory.at(-1), { season: 'autumn', year: 1, revenue: next.population * TAX_RATES[taxRate].rate });
    assert.deepEqual(state, before); assert.ok(readV2Save(writeV2Save(next)).ok);
  }
});
