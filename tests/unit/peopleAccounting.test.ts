import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialTiers, reconcileTiers, PEOPLE_TIPS } from '../../src/data/people.ts';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('Initial and reconciled social tiers conserve every small population', () => {
  for (let population = 0; population <= 100; population++) {
    const initial = getInitialTiers(population);
    assert.equal(initial.serfs + initial.freemen + initial.skilled, population);
    for (let target = 0; target <= 100; target++) {
      const before = { ...initial };
      const next = reconcileTiers(target, initial);
      assert.equal(next.serfs + next.freemen + next.skilled, target);
      for (const value of Object.values(next)) assert.ok(Number.isInteger(value) && value >= 0);
      assert.deepEqual(initial, before);
    }
  }
  assert.deepEqual(getInitialTiers(0), { serfs: 0, freemen: 0, skilled: 0 });
  assert.deepEqual(getInitialTiers(1), { serfs: 1, freemen: 0, skilled: 0 });
  assert.deepEqual(reconcileTiers(3, { serfs: 1, freemen: 1, skilled: 2 }), { serfs: 1, freemen: 0, skilled: 2 });
});

test('Real starvation transition keeps tier counts equal to remaining population', () => {
  const base = createInitialState(104);
  const state = { ...base, phase: 'management', population: 4, food: 0, buildings: [], garrison: 0, taxRate: 'crushing',
    inventory: Object.fromEntries(Object.keys(base.inventory).map(key => [key, 0])),
    people: { ...base.people, tiers: { serfs: 1, freemen: 1, skilled: 2 } },
    military: { ...base.military, garrison: { levy: 0, menAtArms: 0, knights: 0 } } };
  assert.ok(readV2Save(writeV2Save(state)).ok);
  const original = structuredClone(state);
  const next = gameReducer(state, { type: 'SIMULATE_SEASON' });
  assert.equal(next.population, 3);
  assert.deepEqual(next.people.tiers, { serfs: 1, freemen: 0, skilled: 2 });
  assert.equal(next.starvationTurns, 1);
  assert.equal(next.phase, 'seasonal_resolve');
  assert.ok(readV2Save(writeV2Save(next)).ok);
  assert.deepEqual(state, original);
});

test('People labor advice does not claim actual military readiness', () => {
  assert.equal(PEOPLE_TIPS.noGarrison, 'No families are assigned to garrison duty. Hired soldiers and fortifications are managed in Military.');
});
