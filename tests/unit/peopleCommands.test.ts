import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';

const management = () => ({ ...createInitialState(104), phase: 'management' as const });

test('People rejects malformed labor atomically without touching state or RNG', () => {
  const state = management();
  const before = structuredClone(state);
  for (const [field, max] of [['laborFarming', 100], ['laborGarrison', 40], ['laborChurch', 15]] as const) {
    for (const bad of [-1, max + 0.1, NaN, Infinity, '5', true, {}, []]) {
      const next = gameReducer(state, { type: 'PEOPLE_SET_LABOR', payload: { laborFarming: 80, [field]: bad } });
      assert.equal(next, state, `${field} accepted ${String(bad)}`);
    }
  }
  assert.deepEqual(state, before);
});

test('People empty or malformed payloads are no-ops rather than state rewrites', () => {
  const state = management();
  for (const payload of [undefined, null, false, 'labor', [], {}, { laborFarming: null }]) {
    assert.equal(gameReducer(state, { type: 'PEOPLE_SET_LABOR', payload }), state);
  }
  for (const rate of [undefined, null, true, 5, 'unknown', '__proto__']) {
    assert.equal(gameReducer(state, { type: 'SET_TAX_RATE', payload: { rate } }), state);
  }
});

test('People preserves legal fractional and partial labor updates and all four taxes', () => {
  const state = management();
  for (const rate of ['low', 'medium', 'high', 'crushing']) {
    const next = gameReducer(state, { type: 'SET_TAX_RATE', payload: { rate } });
    assert.deepEqual(next, { ...state, taxRate: rate });
  }
  for (const laborFarming of [0, 12.5, 100]) for (const laborGarrison of [0, 7.5, 40]) for (const laborChurch of [0, 2.5, 15]) {
    const payload = { laborFarming, laborGarrison, laborChurch };
    assert.deepEqual(gameReducer(state, { type: 'PEOPLE_SET_LABOR', payload }), { ...state, people: { ...state.people, ...payload } });
  }
  assert.deepEqual(gameReducer(state, { type: 'PEOPLE_SET_LABOR', payload: { laborChurch: 2.5, laborFarming: null } }),
    { ...state, people: { ...state.people, laborChurch: 2.5 } });
});

test('People tax and labor commands cannot change any non-management phase', () => {
  for (const phase of ['title', 'seasonal_action', 'seasonal_resolve', 'random_event', 'random_resolve',
    'raid_warning', 'raid_result', 'flip_intro', 'flip_decision', 'flip_outcome', 'flip_summary', 'game_over', 'victory']) {
    const state = { ...management(), phase };
    assert.equal(gameReducer(state, { type: 'SET_TAX_RATE', payload: { rate: 'low' } }), state);
    assert.equal(gameReducer(state, { type: 'PEOPLE_SET_LABOR', payload: { laborFarming: 80 } }), state);
  }
});
