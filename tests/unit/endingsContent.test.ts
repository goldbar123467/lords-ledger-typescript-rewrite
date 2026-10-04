import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { EMPTY_INVENTORY } from '../../src/data/economy.ts';
import { failureNarratives, victoryTitles, getVictoryTitle, type ReignOutcomeState } from '../../src/data/endings.ts';

test('all five victory and three failure narratives retain the authored pre-rewrite text', () => {
  assert.equal(createHash('sha256').update(JSON.stringify({ victoryTitles, failureNarratives })).digest('hex'),
    '839911db56a8e1883e9485ad8ea1a9e104cd126f2492205df164a3a15b8e375b');
});

test('balanced selection takes precedence, then equal scores retain the authored wealth-first tie', () => {
  const inventory = { ...EMPTY_INVENTORY };
  const state: ReignOutcomeState = { denarii: 600, food: 0, population: 20, garrison: 10,
    castleLevel: 1, inventory, buildings: [] };
  assert.equal(getVictoryTitle(state), victoryTitles.wealthy);
  assert.equal(getVictoryTitle({ ...state, buildings: ['coal_pit', 'tannery', 'sawmill'] }), victoryTitles.balanced);
});
