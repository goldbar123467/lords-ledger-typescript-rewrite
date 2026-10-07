import assert from 'node:assert/strict';
import test from 'node:test';
import { planChapelAction } from '../../src/engine/chapelActions.ts';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { MORAL_DILEMMAS, SHOP_ITEMS } from '../../src/data/chapel.ts';

test('checked Chapel planner rejects invalid commands before drawing randomness', () => {
  const state = { ...createInitialState(104), phase: 'management' as const };
  const noDraw = () => { throw new Error('Rejected command consumed RNG'); };
  assert.equal(planChapelAction(state, 'CHAPEL_SET_VIEW', { view: 'unknown' }, noDraw), null);
  assert.equal(planChapelAction(state, 'CHAPEL_SET_VIEW', { view: 'dilemma' }, noDraw), null);
  for (const amount of [0, -1, NaN, Infinity, 501, '2.5', null]) {
    assert.equal(planChapelAction(state, 'CHAPEL_PAY_TITHE', { amount }, noDraw), null);
  }
  assert.equal(planChapelAction(state, 'CHAPEL_BUY_ITEM', { itemId: 'unknown' }, noDraw), null);
  const allOwned = { ...state, chapel: { ...state.chapel, inventory: SHOP_ITEMS.map(item => item.id) } };
  for (const item of SHOP_ITEMS) assert.equal(planChapelAction(allOwned, 'CHAPEL_BUY_ITEM', { itemId: item.id }, noDraw), null);
  const exhausted = { ...state, chapel: { ...state.chapel, dilemmasCompleted: MORAL_DILEMMAS.map(item => item.id) } };
  assert.equal(planChapelAction(exhausted, 'CHAPEL_START_DILEMMA', undefined, noDraw), null);
  assert.equal(planChapelAction(state, 'CHAPEL_RESOLVE_DILEMMA', { choiceIndex: 0 }, noDraw), null);
});

test('Chapel selection draws only for new greetings, valid donations and available dilemmas', () => {
  const base = { ...createInitialState(104), phase: 'management' as const };
  let draws = 0;
  const random = () => { draws++; return .5; };
  const greeting = planChapelAction(base, 'CHAPEL_SET_VIEW', { view: 'anselm' }, random);
  assert.ok(greeting?.chapel.anselmGreeting);
  assert.equal(draws, 1);
  const visited = { ...base, chapel: { ...base.chapel, ...greeting.chapel } };
  assert.ok(planChapelAction(visited, 'CHAPEL_SET_VIEW', { view: 'anselm' }, random));
  assert.equal(draws, 1);
  const tithe = planChapelAction(base, 'CHAPEL_PAY_TITHE', { amount: .5 }, random);
  assert.equal(tithe?.denarii, 499.5);
  assert.equal(tithe?.churchDonation, .5);
  assert.equal(tithe?.logText, 'Tithed 0.5d to Father Anselm (none).');
  assert.equal(draws, 2);
  const dilemma = planChapelAction(base, 'CHAPEL_START_DILEMMA', undefined, random);
  assert.ok(dilemma?.chapel.currentDilemma);
  assert.equal(draws, 3);
  for (const item of SHOP_ITEMS) assert.ok(planChapelAction(base, 'CHAPEL_BUY_ITEM', { itemId: item.id }, random));
  assert.equal(draws, 3);
  assert.equal(base.denarii, 500);
  assert.deepEqual(base.chapel.inventory, []);
});
