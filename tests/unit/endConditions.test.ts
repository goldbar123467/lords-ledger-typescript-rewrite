import assert from 'node:assert/strict';
import test from 'node:test';
import { BANKRUPTCY_SEASONS, famineSeasonsForDifficulty } from '../../src/engine/endConditions.ts';
import { checkGameOver } from '../../src/engine/meterUtils.js';

test('bankruptcy ends at the executable six season boundary', () => {
  assert.equal(BANKRUPTCY_SEASONS, 6);
  assert.equal(checkGameOver({ population: 20, bankruptcyTurns: 5, starvationTurns: 0, difficulty: 'normal' }), null);
  assert.equal(checkGameOver({ population: 20, bankruptcyTurns: 6, starvationTurns: 0, difficulty: 'normal' })?.type, 'bankruptcy');
});

test('famine boundary reflects difficulty', () => {
  for (const [difficulty, threshold] of [['easy', 4], ['normal', 3], ['hard', 2]] as const) {
    assert.equal(famineSeasonsForDifficulty(difficulty), threshold);
    assert.equal(checkGameOver({ population: 20, bankruptcyTurns: 0, starvationTurns: threshold - 1, difficulty }), null);
    assert.equal(checkGameOver({ population: 20, bankruptcyTurns: 0, starvationTurns: threshold, difficulty })?.type, 'famine');
  }
});
