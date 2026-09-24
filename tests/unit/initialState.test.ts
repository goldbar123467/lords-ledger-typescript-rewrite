import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { generateMarketPrices } from '../../src/data/economy.ts';
import { INITIAL_FAMILIES } from '../../src/data/people.js';

test('new title states own every mutable subsystem', () => {
  const first = createInitialState(42);
  const second = createInitialState(42);

  assert.deepEqual(first, second);
  for (const key of ['inventory', 'buildings', 'marketPrices', 'military', 'people',
    'raids', 'watchtower', 'tavern', 'chapel', 'market', 'greatHall', 'blacksmith'] as const) {
    assert.notStrictEqual(first[key], second[key], `${key} must be fresh`);
  }
  assert.notStrictEqual(first.market.reputation, second.market.reputation);
  const firstFamily = first.people.notableFamilies[0];
  const secondFamily = second.people.notableFamilies[0];
  const authoredFamily = INITIAL_FAMILIES[0];
  assert.ok(firstFamily && secondFamily && authoredFamily);
  assert.notStrictEqual(firstFamily.bonus, secondFamily.bonus);
  assert.notStrictEqual(firstFamily.bonus, authoredFamily.bonus);
  firstFamily.bonus.amount = 7;
  assert.equal(secondFamily.bonus.amount, 1.1);
  assert.equal(authoredFamily.bonus.amount, 1.1);
  first.market.reputation.edmund = 0;
  first.tavern.gambitTotalWins = 3;
  assert.equal(second.market.reputation.edmund, 50);
  assert.equal(second.tavern.gambitTotalWins, 0);
});

test('market price generation consumes only the supplied draw', () => {
  const neutral = generateMarketPrices(() => 0.5);
  const cheap = generateMarketPrices(() => 0);
  const expensive = generateMarketPrices(() => 0.999);
  assert.equal(neutral.sell.grain, 3);
  assert.equal(neutral.buy.spices, 25);
  assert.equal(cheap.buy.spices, 20);
  assert.equal(expensive.buy.spices, 30);
});

test('invalid market draws are rejected before prices enter state', () => {
  for (const draw of [NaN, Infinity, -1, 1, 2]) {
    assert.throws(() => generateMarketPrices(() => draw), RangeError);
  }
  for (const seed of [NaN, Infinity, -1, 2 ** 32, 0.5]) {
    assert.throws(() => createInitialState(seed), RangeError);
  }
});

test('replay resets nested state and preserves difficulty-dependent start', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'normal', seed: 42 },
  });
  const used = {
    ...started,
    turn: 6,
    denarii: 0,
    tavern: { ...started.tavern, gambitTotalWins: 3 },
    market: { ...started.market, reputation: { ...started.market.reputation, agnes: 0 } },
  };
  const replayed = gameReducer(used, {
    type: 'PLAY_AGAIN', payload: { difficulty: 'hard', seed: 42 },
  });
  const freshHard = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'hard', seed: 42 },
  });
  assert.deepEqual(replayed, freshHard);
  assert.equal(used.tavern.gambitTotalWins, 3);
  assert.equal(started.tavern.gambitTotalWins, 0);
});
