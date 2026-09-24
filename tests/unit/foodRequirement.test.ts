import assert from 'node:assert/strict';
import test from 'node:test';
import { SEASON_CONSUMPTION_MULTIPLIERS, SEASON_FARM_MULTIPLIERS, SEASON_INFO } from '../../src/data/economy.ts';
import { simulateEconomy } from '../../src/engine/economyEngine.ts';
import { getSeasonFoodRequirement } from '../../src/engine/foodRequirement.ts';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';

const cases = [
  { difficulty: 'easy', season: 'spring', population: 22, garrison: 5, seasonal: 44, cap: 22, family: 22, total: 23 },
  { difficulty: 'normal', season: 'spring', population: 20, garrison: 5, seasonal: 40, cap: 28, family: 28, total: 29 },
  { difficulty: 'hard', season: 'winter', population: 18, garrison: 3, seasonal: 40, cap: 50, family: 40, total: 41 },
  { difficulty: 'easy', season: 'winter', population: 22, garrison: 5, seasonal: 49, cap: 22, family: 22, total: 23 },
] as const;

test('seasonal food forecast agrees with executable family and garrison consumption', () => {
  for (const row of cases) {
    const demand = getSeasonFoodRequirement(row.population, row.garrison, row.season, row.difficulty);
    assert.equal(demand.seasonalNeed, row.seasonal);
    assert.equal(demand.maxFoodLoss, row.cap);
    assert.equal(demand.familyNeed, row.family);
    assert.equal(demand.garrisonNeed, 1);
    assert.equal(demand.totalNeed, row.total);

    const started = gameReducer(initialState, {
      type: 'START_GAME', payload: { difficulty: row.difficulty, seed: 17 },
    });
    const state = {
      ...started,
      season: row.season,
      population: row.population,
      garrison: row.garrison,
      inventory: { ...started.inventory, grain: 200 },
    };
    const simulated = simulateEconomy(state, () => 0.5);
    const familyLine = simulated.report.find((line: string) => line.startsWith(`Your ${row.population} families consumed `));
    assert.ok(familyLine);
    assert.ok(familyLine.startsWith(`Your ${row.population} families consumed ${row.family} food`));
    if (row.seasonal > row.family) assert.match(familyLine, /rationing saved/);
    if (row.season === 'winter') assert.match(familyLine, /winter rations: ×1\.1/);
    assert.ok(simulated.report.includes(`Your garrison consumed 1 food.`));
  }
});

test('season guidance uses the actual farm and winter consumption multipliers', () => {
  assert.equal(SEASON_FARM_MULTIPLIERS.spring, 0.6);
  assert.equal(SEASON_CONSUMPTION_MULTIPLIERS.winter, 1.1);
  assert.match(SEASON_INFO.spring.desc, /Farm output ×0\.6/);
  assert.match(SEASON_INFO.winter.desc, /\+10% food consumption before ration cap/);
});

test('food shortfall is reported in food units rather than an impossible family count', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'hard', seed: 17 },
  });
  const state = {
    ...started,
    season: 'winter',
    turn: 4,
    population: 18,
    garrison: 3,
    buildings: [],
    inventory: Object.fromEntries(Object.keys(started.inventory).map(resource => [resource, 0])),
    food: 0,
  };
  const simulated = simulateEconomy(state, () => 0.5);
  const report = simulated.report.find((line: string) => line.startsWith('Your 18 families needed 40 food'));
  assert.ok(report);
  assert.match(report, /only had 4\. Shortfall: 36 food\./);
  assert.equal(simulated.population, 13);
  const next = gameReducer(state, { type: 'SIMULATE_SEASON' });
  assert.ok(next.chronicle.some((entry: { text?: string; message?: string }) =>
    String(entry.text ?? entry.message ?? '').includes('Shortfall: 36 food.')));
});
