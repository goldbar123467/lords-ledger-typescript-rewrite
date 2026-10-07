import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save} from '../../src/save/saveGame.ts';

for (const route of ['posted', 'negotiated'] as const) {
  test(`${route} spice purchases apply the yearly 3/1/1/0 faith schedule exactly once`, () => {
    for (const [previous, faith, expected] of [[0, 50, 55], [1, 50, 52], [2, 50, 51], [3, 50, 50], [0, 98, 100]]) {
      assert.ok(previous !== undefined && faith !== undefined && expected !== undefined);
      const initial = gameReducer(createInitialState(17), {type: 'START_GAME', payload: {difficulty: 'easy', seed: 17}});
      const state = {...initial, chapel: {...initial.chapel, faith, spicePurchasesThisYear: previous}};
      const ready = route === 'posted' ? state : gameReducer(state, {type: 'HAGGLE_START',
        payload: {merchantId: 'giovanni', resource: 'spices', quantity: 4, mode: 'buy'}});
      const before = structuredClone(ready);
      const bought = gameReducer(ready, route === 'posted'
        ? {type: 'BUY_RESOURCE', payload: {resource: 'spices', quantity: 4}}
        : {type: 'HAGGLE_ACCEPT'});
      assert.notStrictEqual(bought, ready);
      assert.deepEqual(ready, before);
      assert.equal(bought.chapel.faith, expected);
      assert.equal(bought.chapel.spicePurchasesThisYear, previous + 4);
      assert.equal(bought.synergies.spicePurchases, initial.synergies.spicePurchases + 4);
      assert.equal(bought.inventory.spices, (state.inventory.spices ?? 0) + 4);
      assert.equal(bought.market.supply?.purchased.spices, 4);
      assert.equal(bought.rngState, ready.rngState);
      const raw = writeV2Save(bought);
      const loaded = readV2Save(raw);
      assert.ok(loaded.ok);
      assert.equal(writeV2Save(loaded.state), raw);
      if (route === 'negotiated') assert.strictEqual(gameReducer(bought, {type: 'HAGGLE_ACCEPT'}), bought);
    }
  });
}
