import assert from 'node:assert/strict';
import test from 'node:test';
import BUILDINGS from '../../src/data/buildings.ts';
import { FOOD_BUILDING_IDS, SYNERGY_PATHS, SYNERGY_PATH_LIST, SYNERGY_TIER_MAP } from '../../src/data/synergies.ts';
import type { SynergyConditions } from '../../src/data/synergies.ts';
import {
  advanceSynergyCounters, checkSynergies, checkTierConditions, getActiveSynergyDisplay, getSynergyBuildings,
  getSynergyMeterEffects, getSynergyPassiveIncome, getSynergyTradePriceBonus,
  getSynergyVictoryTitle, getSynergyWoolSellBonus, hasSynergyPopulationBonus,
} from '../../src/engine/synergyEngine.ts';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('seven authored paths retain three ordered, unique tiers and valid building references', () => {
  assert.equal(Object.keys(SYNERGY_PATHS).length, 7);
  assert.equal(SYNERGY_PATH_LIST.length, 7);
  assert.equal(Object.keys(SYNERGY_TIER_MAP).length, 21);
  const ids = new Set<string>();
  for (const [pathId, path] of Object.entries(SYNERGY_PATHS)) {
    assert.equal(path.id, pathId);
    assert.deepEqual(path.tiers.map(tier => tier.tier), [1, 2, 3]);
    for (const tier of path.tiers) {
      const conditions: SynergyConditions = tier.conditions;
      assert.ok(!ids.has(tier.id), `duplicate ${tier.id}`);
      ids.add(tier.id);
      assert.equal(SYNERGY_TIER_MAP[tier.id]?.tier, tier);
      for (const buildingId of Object.keys(conditions.buildings ?? {})) {
        assert.ok(Object.hasOwn(BUILDINGS, buildingId), `${tier.id}: ${buildingId}`);
      }
    }
  }
  assert.deepEqual(new Set(FOOD_BUILDING_IDS), new Set(['strip_farm', 'demesne_field', 'fishpond']));
});

test('only the next unactivated tier unlocks per path, including legacy building strings', () => {
  const state = {
    buildings: [{ type: 'pasture' }, 'pasture', 'fulling_mill'],
    castleLevel: 2, synergies: { activated: [], woolTrades: 8 },
  };
  assert.ok(checkSynergies(state).includes('wool_baron_1'));
  assert.ok(!checkSynergies(state).includes('wool_baron_2'));
  assert.ok(checkSynergies({ ...state, synergies: { ...state.synergies, activated: ['wool_baron_1'] } }).includes('wool_baron_2'));
  assert.ok(checkSynergies({ ...state, synergies: { ...state.synergies, activated: ['wool_baron_1', 'wool_baron_2'] } }).includes('wool_baron_3'));
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.wool_baron_3!.tier, { ...state, castleLevel: 1 }), false);
});

test('bonuses, victory priority, display, and marked buildings use authored tiers', () => {
  const active = ['wool_baron_1', 'wool_baron_2', 'wool_baron_3', 'breadbasket_2', 'market_king_1'];
  assert.equal(getSynergyPassiveIncome(active), 18);
  assert.equal(getSynergyTradePriceBonus(active), 1);
  assert.equal(getSynergyWoolSellBonus(active), 6);
  assert.equal(hasSynergyPopulationBonus(active), true);
  assert.deepEqual(getSynergyMeterEffects(active), { treasury: 0, people: 2, military: 0, faith: 0 });
  assert.equal(getSynergyVictoryTitle(active)?.title, 'Baron of the Golden Fleece');
  assert.deepEqual(getActiveSynergyDisplay(active).map(entry => [entry.pathName, entry.tierLevel]), [
    ['The Wool Baron', 3], ['The Breadbasket', 2], ['The Market King', 1],
  ]);
  assert.deepEqual(getSynergyBuildings(active, ['pasture', { type: 'fulling_mill' }, 'strip_farm']),
    new Set(['pasture', 'fulling_mill', 'strip_farm']));
});

test('Pious and People tiers require their live faith, approval, and sustained turns', () => {
  const herb = ['herb_garden'];
  const pious = { buildings: herb, chapel: { faith: 50 }, synergies: { spicePurchases: 2, highFaithTurns: 0 } };
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.pious_lord_1!.tier, pious), false);
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.pious_lord_1!.tier,
    { ...pious, chapel: { faith: 60 } }), true);
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.pious_lord_2!.tier,
    { ...pious, chapel: { faith: 70 }, synergies: { spicePurchases: 2, highFaithTurns: 2 } }), false);
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.pious_lord_2!.tier,
    { ...pious, chapel: { faith: 70 }, synergies: { spicePurchases: 2, highFaithTurns: 3 } }), true);

  const people = { population: 25, greatHall: { meters: { people: 64 } },
    synergies: { lowTaxTurns: 6, highPeopleTurns: 4 } };
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.peoples_lord_2!.tier, people), false);
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.peoples_lord_2!.tier,
    { ...people, greatHall: { meters: { people: 65 } } }), true);
  assert.equal(checkTierConditions(SYNERGY_TIER_MAP.peoples_lord_3!.tier,
    { ...people, population: 30, synergies: { lowTaxTurns: 8, highPeopleTurns: 4 } }), false);
});

test('a legal tithe and season unlock Pious tier one and apply its faith reward once', () => {
  const started = gameReducer(createInitialState(17),
    { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
  const built = gameReducer(started, { type: 'BUILD_BUILDING', payload: { buildingId: 'herb_garden' } });
  const low = gameReducer(gameReducer(built,
    { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } }), { type: 'ADVANCE_TURN' });
  assert.ok(!low.synergies.activated.includes('pious_lord_1'));
  assert.equal(low.chapel.faith, 50);

  const tithed = gameReducer(built, { type: 'CHAPEL_PAY_TITHE', payload: { amount: 50 } });
  assert.equal(tithed.chapel.faith, 62);
  const high = gameReducer(gameReducer(tithed,
    { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } }), { type: 'ADVANCE_TURN' });
  assert.ok(high.synergies.activated.includes('pious_lord_1'));
  assert.equal(high.synergies.highFaithTurns, 1);
  assert.equal(high.chapel.faith, 63);
});

test('synergy counters reset below live thresholds and old saves may omit them', () => {
  const started = gameReducer(createInitialState(17),
    { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
  const first = advanceSynergyCounters(started.synergies,
    { taxRate: 'low', food: 101, faith: 60, peopleApproval: 65 });
  assert.deepEqual([first.lowTaxTurns, first.foodSurplusTurns, first.highFaithTurns, first.highPeopleTurns],
    [1, 1, 1, 1]);
  const second = advanceSynergyCounters(first,
    { taxRate: 'high', food: 100, faith: 59, peopleApproval: 64 });
  assert.deepEqual([second.lowTaxTurns, second.foodSurplusTurns, second.highFaithTurns, second.highPeopleTurns],
    [0, 0, 0, 0]);

  const old = structuredClone(JSON.parse(writeV2Save(started)));
  delete old.state.synergies.highFaithTurns;
  delete old.state.synergies.highPeopleTurns;
  assert.equal(readV2Save(JSON.stringify(old)).ok, true);
  for (const [section, field, value] of [
    ['synergies', 'highFaithTurns', '3'],
    ['synergies', 'highPeopleTurns', -1],
    ['synergies', 'highPeopleTurns', 1.5],
    ['chapel', 'faith', '60'],
  ] as const) {
    const corrupted = structuredClone(old);
    corrupted.state[section][field] = value;
    assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false, `${section}.${field}`);
  }
  const corrupted = structuredClone(old);
  corrupted.state.greatHall.meters.people = '65';
  assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false);
});
