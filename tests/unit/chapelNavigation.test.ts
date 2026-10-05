import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { writeV2Save } from '../../src/save/saveGame.ts';

test('malformed Chapel navigation cannot erase the current view or RNG', () => {
  const state = { ...createInitialState(104), phase: 'management' };
  const before = structuredClone(state);
  for (const view of [undefined, null, {}, [], 0, '', 'unknown', 'dilemma']) {
    assert.equal(gameReducer(state, { type: 'CHAPEL_SET_VIEW', payload: { view } }), state);
  }
  assert.equal(gameReducer(state, { type: 'CHAPEL_SET_VIEW' }), state);
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => writeV2Save(state));
});


test('Chapel navigation is phase-gated and rejects a nonexistent pending dilemma', () => {
  const base = createInitialState(104);
  for (const phase of ['title', 'resolving', 'event', 'raid', 'flip', 'gameover', 'victory']) {
    const state = { ...base, phase };
    assert.equal(gameReducer(state, { type: 'CHAPEL_SET_VIEW', payload: { view: 'anselm' } }), state);
  }
  const bad = { ...base, phase: 'management', chapel: { ...base.chapel, currentDilemma: { id: 'unknown', title: 'Unknown' } } };
  assert.equal(gameReducer(bad, { type: 'CHAPEL_SET_VIEW', payload: { view: 'dilemma' } }), bad);
});

test('valid legacy optional/null Chapel fields remain saveable after each legal entry command', () => {
  const base = { ...createInitialState(104), phase: 'management' };
  for (const chapel of [{ faith: 50 }, { faith: 50, view: null, piety: null, inventory: null, dilemmasCompleted: null, gameLog: null }]) {
    const state = { ...base, chapel };
    assert.doesNotThrow(() => writeV2Save(state));
    const actions = [
      ...['nave', 'anselm', 'caedmon', 'manuscript'].map(view => ({ type: 'CHAPEL_SET_VIEW', payload: { view } })),
      { type: 'CHAPEL_START_DILEMMA' }, { type: 'CHAPEL_MS_START' },
      { type: 'CHAPEL_PAY_TITHE', payload: { amount: .5 } },
      { type: 'CHAPEL_BUY_ITEM', payload: { itemId: 'monastery_herbs' } },
    ];
    for (const action of actions) {
      const next = gameReducer(state, action);
      assert.notEqual(next, state);
      assert.equal(next.chapel.faith, 50);
      assert.doesNotThrow(() => writeV2Save(next), action.type);
    }
    assert.equal(state.chapel, chapel);
  }
});
