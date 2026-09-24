import assert from 'node:assert/strict';
import test from 'node:test';
import BUILDINGS, {
  BUILDING_LIST, FOOD_BUILDINGS, MATERIAL_BUILDINGS,
  FORGE_BUILDINGS, PROCESSING_BUILDINGS,
} from '../../src/data/buildings.ts';
import { RESOURCE_CONFIG } from '../../src/data/economy.ts';

test('all 17 authored buildings appear once in the display groups with valid references', () => {
  const grouped = [FOOD_BUILDINGS, MATERIAL_BUILDINGS, FORGE_BUILDINGS, PROCESSING_BUILDINGS].flat();
  assert.equal(Object.keys(BUILDINGS).length, 17);
  assert.deepEqual(grouped, BUILDING_LIST);
  assert.deepEqual(new Set(grouped.map(building => building.id)), new Set(Object.keys(BUILDINGS)));

  for (const [id, building] of Object.entries(BUILDINGS)) {
    assert.equal(building.id, id);
    assert.ok(Number.isFinite(building.cost) && building.cost >= 0);
    assert.ok(Number.isFinite(building.upkeep) && building.upkeep >= 0);
    assert.ok(Number.isInteger(building.maxCount) && building.maxCount > 0);
    if (building.requires) assert.ok(Object.hasOwn(BUILDINGS, building.requires));
    if (building.upgradeTo) assert.ok(Object.hasOwn(BUILDINGS, building.upgradeTo));
    for (const synergy of building.buildingSynergies) {
      assert.ok(Object.hasOwn(BUILDINGS, synergy.with));
      assert.ok(Number.isFinite(synergy.bonus));
    }
    for (const [resource, quantity] of Object.entries(building.produces)) {
      assert.ok(Object.hasOwn(RESOURCE_CONFIG, resource));
      assert.ok(Number.isFinite(quantity) && quantity > 0);
    }
    for (const [resource, quantity] of Object.entries(building.consumes ?? {})) {
      assert.ok(Object.hasOwn(RESOURCE_CONFIG, resource));
      assert.ok(Number.isFinite(quantity) && quantity > 0);
    }
  }
});
