import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {getTotalFood} from '../../src/engine/economyEngine.ts';
import {readV2Save, writeV2Save} from '../../src/save/saveGame.ts';

for (const goods of [{resource: 'grain', merchantId: 'edmund'}, {resource: 'wool', merchantId: 'agnes'}] as const) {
  test(`${goods.resource} legacy fractions leave only whole units in a saveable bargain`, () => {
    for (const [stock, oneUnitFill, threeUnitFill] of [
      [0.052, 0, 0], [0.5, 0, 0], [0.999, 0, 0], [1, 1, 1], [1.5, 1, 1], [2.5, 1, 2], [3.5, 1, 3],
    ] as const) for (const [requested, expected] of [[1, oneUnitFill], [3, threeUnitFill]] as const) {
      const started = gameReducer(createInitialState(17), {type: 'START_GAME', payload: {difficulty: 'easy', seed: 17}});
      const inventory = {...started.inventory, [goods.resource]: stock};
      const raw = writeV2Save({...started, inventory, food: getTotalFood(inventory)});
      const loaded = readV2Save(raw);
      assert.ok(loaded.ok);
      const original = structuredClone(loaded.state);
      const pending = gameReducer(loaded.state, {type: 'HAGGLE_START',
        payload: {...goods, quantity: requested, mode: 'sell'}});
      assert.deepEqual(loaded.state, original);
      assert.equal(pending.rngState, loaded.state.rngState);
      if (expected === 0) {
        assert.equal(pending === loaded.state, true);
        assert.equal(writeV2Save(pending), raw);
        continue;
      }
      assert.ok(pending.market.activeHaggle);
      assert.equal(pending.market.activeHaggle.quantity, expected);
      const pendingRaw = writeV2Save(pending);
      const resumed = readV2Save(pendingRaw);
      assert.ok(resumed.ok);
      assert.equal(writeV2Save(resumed.state), pendingRaw);
      const settled = gameReducer(resumed.state, {type: 'HAGGLE_ACCEPT'});
      assert.equal(settled.inventory[goods.resource], stock - expected);
      assert.equal(settled.denarii, started.denarii + expected * pending.market.activeHaggle.currentOffer);
      assert.equal(settled.rngState, started.rngState);
      assert.equal(settled.market.activeHaggle, null);
      assert.strictEqual(gameReducer(settled, {type: 'HAGGLE_ACCEPT'}), settled);
      const finalRaw = writeV2Save(settled);
      const final = readV2Save(finalRaw);
      assert.ok(final.ok);
      assert.equal(writeV2Save(final.state), finalRaw);
    }
  });
}
