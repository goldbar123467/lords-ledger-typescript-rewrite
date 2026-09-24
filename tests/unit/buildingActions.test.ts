import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';

function freshGame() {
  return gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'normal' } });
}

test('building twice from the same state gives the same result regardless of wall clock', () => {
  const state = freshGame();
  const originalNow = Date.now;
  try {
    Date.now = () => 101;
    const first = gameReducer(state, { type: 'BUILD_BUILDING', payload: { buildingId: 'strip_farm' } });
    Date.now = () => 999;
    const second = gameReducer(state, { type: 'BUILD_BUILDING', payload: { buildingId: 'strip_farm' } });
    assert.deepEqual(first, second);
    assert.notEqual(first, state);
    assert.equal(first.denarii, state.denarii - 80);
    assert.equal(first.buildings.length, state.buildings.length + 1);
    assert.equal(state.buildings.length, 4);
  } finally {
    Date.now = originalNow;
  }
});

test('invalid building indices do not mutate or spend state', () => {
  const state = freshGame();
  for (const type of ['DEMOLISH_BUILDING', 'REPAIR_BUILDING', 'UPGRADE_BUILDING']) {
    for (const buildingIndex of [undefined, NaN, 1.5, -1, state.buildings.length]) {
      assert.equal(gameReducer(state, { type, payload: { buildingIndex } }), state, `${type} ${String(buildingIndex)}`);
    }
  }
});

test('upgrade respects the target type limit', () => {
  const state = {
    ...freshGame(),
    denarii: 1000,
    buildings: [
      { instanceId: 'farm', type: 'strip_farm', condition: 100, builtOnTurn: 1 },
      { instanceId: 'field-1', type: 'demesne_field', condition: 100, builtOnTurn: 1 },
      { instanceId: 'field-2', type: 'demesne_field', condition: 100, builtOnTurn: 1 },
    ],
  };
  assert.equal(gameReducer(state, { type: 'UPGRADE_BUILDING', payload: { buildingIndex: 0 } }), state);
});

test('legacy string building upgrades to a valid uniquely identified instance', () => {
  const state = { ...freshGame(), buildings: ['strip_farm'], denarii: 500 };
  const result = gameReducer(state, { type: 'UPGRADE_BUILDING', payload: { buildingIndex: 0 } });
  assert.notEqual(result, state);
  assert.equal(result.denarii, 380);
  assert.equal(result.buildings[0].type, 'demesne_field');
  assert.equal(result.buildings[0].condition, 100);
  assert.equal(typeof result.buildings[0].instanceId, 'string');
  assert.equal(state.buildings[0], 'strip_farm');
});
