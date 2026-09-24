import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';

const game = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'normal' } });

test('market actions reject malformed quantities without changing state', () => {
  for (const type of ['BUY_RESOURCE', 'SELL_RESOURCE']) {
    for (const quantity of [undefined, NaN, Infinity, -1, 0, 1.5, '5']) {
      assert.equal(gameReducer(game, { type, payload: { resource: 'grain', quantity } }), game, `${type} ${String(quantity)}`);
    }
    assert.equal(gameReducer(game, { type, payload: { resource: 'not-a-resource', quantity: 1 } }), game);
  }
  for (const quantity of [undefined, NaN, Infinity, -1, 0, 1.5]) {
    assert.equal(gameReducer(game, { type: 'HAGGLE_START', payload: { merchantId: 'edmund', resource: 'grain', mode: 'sell', quantity } }), game);
  }
});

test('forge purchase calculates the cost from the saved price, not the action payload', () => {
  const state = { ...game, blacksmith: { ...game.blacksmith, marketPrices: { steel: 7 } } };
  const result = gameReducer(state, { type: 'BLACKSMITH_BUY_RESOURCE', payload: { resource: 'steel', quantity: 5, totalCost: 1 } });
  assert.equal(result.denarii, state.denarii - 35);
  assert.equal(result.inventory.steel, state.inventory.steel + 5);
  assert.equal(result.blacksmith.totalGoldInvested, state.blacksmith.totalGoldInvested + 35);
  assert.equal(gameReducer(state, { type: 'BLACKSMITH_BUY_RESOURCE', payload: { resource: 'unknown', quantity: 1, totalCost: 1 } }), state);
  assert.equal(gameReducer(state, { type: 'BLACKSMITH_BUY_RESOURCE', payload: { resource: 'steel', quantity: NaN, totalCost: 1 } }), state);
});
