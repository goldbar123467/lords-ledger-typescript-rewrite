import assert from 'node:assert/strict';
import test from 'node:test';
import { applyResourceEffects, checkGameOver, translateEffects, translateIndicators } from '../../src/engine/meterUtils.ts';
import { EMPTY_INVENTORY } from '../../src/data/economy.ts';

test('numeric resource effects stack while qualitative direct indicators take precedence', () => {
  assert.deepEqual(translateEffects({ treasury: 2, denarii: 7, people: -1, food: 4, military: 2, garrison: 1, morale: 4, faith: -2 }),
    { denarii: 17, food: 1, population: 0, garrison: 2, morale: 10 });
  assert.deepEqual(translateEffects({ military: -1 }), { denarii: 0, food: 0, population: 0, garrison: -1, morale: -3 });
  assert.deepEqual(translateEffects(null), { denarii: 0, food: 0, population: 0, garrison: 0 });
  assert.deepEqual(translateIndicators({ treasury: 'up', denarii: 'down', military: 'down', garrison: 'up', faith: 'up' }),
    { denarii: 'down', garrison: 'up' });
  assert.deepEqual(translateIndicators({ treasury: 'down', faith: 'up' }), { denarii: 'down' });
  assert.deepEqual(translateIndicators({ faith: 'up', population: 'down' }), { denarii: 'up', population: 'down' });
  assert.equal(translateIndicators({}), null);
});

test('resource application preserves input and military metadata, caps totals, and debits grain only', () => {
  const state = { denarii: 10, population: 10, garrison: 6,
    inventory: { ...EMPTY_INVENTORY, grain: 4, livestock: 2, fish: 3, flour: 1 },
    military: { morale: 98, garrison: { levy: 6, menAtArms: 0, knights: 0 }, trained: true },
  };
  const before = structuredClone(state);
  const after = applyResourceEffects(state, { denarii: -30, population: -5, garrison: 3, food: -10, morale: 6 });
  assert.equal(after.denarii, 0);
  assert.equal(after.population, 5);
  assert.equal(after.garrison, 3, 'population cap is 60% of the resulting population');
  assert.equal(after.inventory.grain, 0);
  assert.equal(after.food, 6, 'other food is neither consumed nor counted twice');
  assert.equal(after.military?.morale, 100);
  assert.equal(after.military?.trained, true);
  assert.deepEqual(state, before);
  const unchanged = applyResourceEffects(state, { denarii: 0, population: 0, garrison: 0, food: 0 });
  assert.equal(unchanged.inventory, state.inventory);
  assert.equal(unchanged.military, state.military);
  const legacy = applyResourceEffects({ ...state, military: { garrison: state.military.garrison } },
    { denarii: 0, population: 0, garrison: 0, food: 0, morale: -80 }, 2);
  assert.equal(legacy.military?.morale, 0, 'missing morale starts at 50');
  assert.equal(legacy.garrison, 2, 'explicit garrison capacity still applies');
});

test('simultaneous terminal conditions keep depopulation, bankruptcy, then famine priority', () => {
  const all = { population: 0, bankruptcyTurns: 6, starvationTurns: 4, difficulty: 'easy' };
  assert.equal(checkGameOver(all)?.type, 'depopulation');
  assert.equal(checkGameOver({ ...all, population: 10 })?.type, 'bankruptcy');
  assert.equal(checkGameOver({ ...all, population: 10, bankruptcyTurns: 5 })?.type, 'famine');
  assert.equal(checkGameOver({ population: 10, difficulty: 'normal' }), null);
});
