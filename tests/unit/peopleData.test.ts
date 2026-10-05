import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialTiers, reconcileTiers, getInitialPeopleState, computeMorale, updateFamilyLoyalty,
  checkFamilyDepartures, checkFamilyReturns, pickFeedEvents, getContextualTip, PEOPLE_TIPS } from '../../src/data/people.ts';

test('People initial state and tier reconciliation preserve distribution and ownership', () => {
  assert.deepEqual(getInitialTiers(20), { serfs: 11, freemen: 6, skilled: 3 });
  const tiers = getInitialTiers(20);
  assert.deepEqual(reconcileTiers(24, tiers), { serfs: 12, freemen: 9, skilled: 3 });
  assert.deepEqual(reconcileTiers(15, tiers), { serfs: 11, freemen: 1, skilled: 3 });
  assert.deepEqual(tiers, { serfs: 11, freemen: 6, skilled: 3 });
  const a = getInitialPeopleState(20), b = getInitialPeopleState(20);
  assert.deepEqual(a, b);
  assert.notStrictEqual(a.notableFamilies[0]?.bonus, b.notableFamilies[0]?.bonus);
});

test('People morale uses exact food and labor thresholds and nullish defaults', () => {
  assert.deepEqual(computeMorale({}).factors, { base: 50, tax: 5, food: -5, garrison: 0, church: 5, loyalty: 0 });
  assert.equal(computeMorale({}).value, 55);
  assert.equal(computeMorale({ taxRate: 'low', resourceDeltas: { food: 1 } }).value, 80);
  for (const [food, expected] of [[0, -5], [-49, -5], [-50, -15]] as const)
    assert.equal(computeMorale({ resourceDeltas: { food } }).factors.food, expected);
  for (const [laborGarrison, expected] of [[15, 0], [16, -5], [30, -5], [31, -10]] as const)
    assert.equal(computeMorale({ people: { laborGarrison, laborChurch: 0 } }).factors.garrison, expected);
  assert.equal(computeMorale({ taxRate: 'crushing', people: { laborChurch: 0, laborGarrison: 31 }, resourceDeltas: { food: -50 } }).level.label, 'Revolt');
});

test('Family loyalty and leave/return thresholds retain the authored rules', () => {
  const families = getInitialPeopleState(20).notableFamilies;
  const before = structuredClone(families);
  const next = updateFamilyLoyalty(families, 'crushing', 20, 0, 0, -51);
  assert.deepEqual(next.map(f => f.loyalty), [0, 0, 0, 0]);
  assert.deepEqual(checkFamilyDepartures(next, 34), ['tanner', 'miller', 'smith']);
  assert.deepEqual(checkFamilyDepartures(next, 35), []);
  const gone = next.map(f => ({ ...f, present: false, turnsGone: 3 }));
  assert.deepEqual(checkFamilyReturns(gone, 60), []);
  assert.deepEqual(checkFamilyReturns(gone, 61), ['tanner', 'miller', 'smith']);
  assert.equal(updateFamilyLoyalty(gone, 'low', 90, 0, 5, 1)[0]?.turnsGone, 4);
  assert.deepEqual(families, before);
});

test('Village feed draws exactly twice and preserves warning order', () => {
  let draws = 0;
  const absent = getInitialPeopleState(20).notableFamilies.map(f => ({ ...f, present: false, turnsGone: 1 }));
  const events = pickFeedEvents('winter', 19, -51, 20, absent, () => { draws++; return 0; });
  assert.equal(draws, 2);
  assert.equal(events[0]?.text, 'Snow covers the village. The world is quiet except for the crunch of boots on ice.');
  assert.equal(events[1]?.text, 'The Cooper family welcomed a son this season. The father is already teaching him to make barrels.');
  assert.deepEqual(events.map(e => e.type), ['life', 'life', 'warning', 'warning', 'warning', 'warning', 'warning', 'warning', 'warning']);
});

test('Contextual People tips keep their priority at exact boundaries', () => {
  assert.equal(getContextualTip(19, 'crushing', 0, 0, -1), PEOPLE_TIPS.revolt);
  assert.equal(getContextualTip(20, 'crushing', 0, 0, -1), PEOPLE_TIPS.lowMorale);
  assert.equal(getContextualTip(40, 'crushing', 0, 0, -1), PEOPLE_TIPS.highTax);
  assert.equal(getContextualTip(40, 'medium', 0, 0, -1), PEOPLE_TIPS.foodShortage);
  assert.equal(getContextualTip(40, 'medium', 0, 0, 1), PEOPLE_TIPS.noGarrison);
  assert.equal(getContextualTip(40, 'medium', 5, 0, 1), PEOPLE_TIPS.noChurch);
  assert.equal(getContextualTip(40, 'medium', 5, 5, 51), PEOPLE_TIPS.surplus);
});

test('Village feed rejects out-of-range draws rather than persisting absent text', () => {
  for (const draw of [-1, 1, NaN, Infinity])
    assert.throws(() => pickFeedEvents('spring', 50, 0, 20, null, () => draw), RangeError);
});
