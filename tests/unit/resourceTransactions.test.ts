import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { invokeGameReducer } from '../gameInput.ts';
import { writeV2Save } from '../../src/save/saveGame.ts';

const game = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'normal' } });

test('legacy donations reject coerced amounts without changing a saveable state', () => {
  const before = writeV2Save(game);
  for (const amount of ['5', 'abc', true, false, [5], [], {}, null, undefined, NaN,
    Infinity, -Infinity, -1, 0, game.denarii + 1, 5n, Symbol('amount')]) {
    assert.strictEqual(invokeGameReducer(game, { type: 'DONATE_TO_CHURCH', payload: { amount } }), game);
    assert.equal(writeV2Save(game), before);
  }
  for (const payload of [undefined, null, {}]) {
    assert.strictEqual(invokeGameReducer(game, { type: 'DONATE_TO_CHURCH', payload }), game);
  }
});

test('legacy donation totals reject overflow atomically', () => {
  const state = { ...game, denarii: Number.MAX_VALUE, churchDonation: Number.MAX_VALUE };
  const before = writeV2Save(state);
  assert.strictEqual(invokeGameReducer(state, { type: 'DONATE_TO_CHURCH', payload: { amount: Number.MAX_VALUE } }), state);
  assert.equal(writeV2Save(state), before);
});

test('finite fractional legacy donations retain their cost, total, history and RNG', () => {
  const before = writeV2Save(game);
  const next = gameReducer(game, { type: 'DONATE_TO_CHURCH', payload: { amount: 0.5 } });
  assert.equal(next.denarii, game.denarii - 0.5);
  assert.equal(next.churchDonation, (game.churchDonation || 0) + 0.5);
  assert.equal(next.chronicle.at(-1)?.text, 'Donated 0.5d to the Church.');
  assert.equal(next.rngState, game.rngState);
  assert.doesNotThrow(() => writeV2Save(next));
  assert.equal(writeV2Save(game), before);
  const wrongPhase = { ...game, phase: 'seasonal_resolve' as const };
  assert.strictEqual(gameReducer(wrongPhase, { type: 'DONATE_TO_CHURCH', payload: { amount: 0.5 } }), wrongPhase);
});

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
  assert.equal(result.blacksmith.totalGoldInvested, present(state.blacksmith.totalGoldInvested, "state.blacksmith.totalGoldInvested") + 35);
  assert.equal(gameReducer(state, { type: 'BLACKSMITH_BUY_RESOURCE', payload: { resource: 'unknown', quantity: 1, totalCost: 1 } }), state);
  assert.equal(gameReducer(state, { type: 'BLACKSMITH_BUY_RESOURCE', payload: { resource: 'steel', quantity: NaN, totalCost: 1 } }), state);
});
