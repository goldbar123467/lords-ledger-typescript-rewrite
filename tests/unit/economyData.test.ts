import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_RESOURCES, EMPTY_INVENTORY, FOOD_RESOURCES, FORGE_MATERIALS,
  RAW_MATERIALS, RESOURCE_CONFIG, TRADE_GOODS,
  BASE_BUY_PRICES, BASE_SELL_PRICES,
} from '../../src/data/economy.ts';

test('authored resource groups, inventory, and posted prices share valid IDs', () => {
  const groups = [
    ['food', FOOD_RESOURCES], ['raw', RAW_MATERIALS],
    ['forge', FORGE_MATERIALS], ['trade', TRADE_GOODS],
  ] as const;
  const grouped: string[] = [];
  for (const [category, resources] of groups) {
    for (const resource of resources) {
      assert.equal(RESOURCE_CONFIG[resource].category, category);
      grouped.push(resource);
    }
  }
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual([...ALL_RESOURCES], grouped);
  assert.deepEqual(Object.keys(EMPTY_INVENTORY), grouped);
  assert.deepEqual(Object.keys(BASE_SELL_PRICES).sort(), grouped.slice().sort());
  for (const resource of Object.keys(BASE_BUY_PRICES)) assert.ok(Object.hasOwn(RESOURCE_CONFIG, resource));
  assert.deepEqual(
    Object.entries(RESOURCE_CONFIG).filter(([, config]) => config.category === 'buyOnly').map(([id]) => id),
    ['salt', 'tools', 'spices'],
  );
});
