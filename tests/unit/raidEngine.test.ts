import assert from 'node:assert/strict';
import test from 'node:test';
import { checkForRaid, getInitialRaidState, resolveRaid } from '../../src/engine/raidEngine.ts';

test('raid trigger order and forced border raid match the authored schedule', () => {
  const raids = getInitialRaidState();
  assert.equal(checkForRaid(raids, 1, () => 0), null);
  assert.deepEqual(checkForRaid(raids, 4, () => 0.25), { type: 'criminal' });
  assert.deepEqual(checkForRaid(raids, 8, () => 0.25), { type: 'scottish' });
  assert.deepEqual(checkForRaid({ ...raids, lastRaidTurn: 8 }, 16, () => 0.99), { type: 'scottish' });
  assert.equal(raids.totalScottishRaids, 0);
});

test('zero-garrison fortifications can win and partial defense scales defeat', () => {
  const inventory = { wool: 12, cloth: 4 };
  const victory = resolveRaid('criminal', 18, 18, 0, 1, inventory, 'normal', () => 0.25);
  assert.ok(victory);
  assert.equal(victory.victory, true);
  assert.equal(victory.defenseRatio, 1);
  assert.match(victory.narrativeLine, /walls held/i);
  assert.doesNotMatch(victory.narrativeLine, /soldiers (fought|held)|garrison (held|captain)/i);

  const defeat = resolveRaid('criminal', 10, 18, 0, 1, inventory, 'normal', () => 0.25);
  assert.ok(defeat);
  assert.equal(defeat.victory, false);
  assert.equal(defeat.partial, true);
  assert.equal(defeat.defenseRatio, 10 / 18);
  assert.equal(defeat.denariiDelta, -22);
  assert.deepEqual(defeat.tradeGoodLost, { resource: 'wool', amount: 1 });
  assert.equal(defeat.garrisonDelta, 0);
  assert.match(defeat.narrativeLine, /fortifications delayed them/i);
  assert.doesNotMatch(defeat.narrativeLine, /unopposed/i);

  const undefended = resolveRaid('criminal', 0, 18, 0, 1, inventory, 'normal', () => 0.25);
  assert.ok(undefended);
  assert.equal(undefended.partial, false);
  assert.match(undefended.narrativeLine, /unopposed/i);
});

test('raid outcomes replay under the same draw and reject invalid draws', () => {
  const inventory = { wool: 12, cloth: 4 };
  const args = ['scottish', 20, 38, 6, 0, inventory, 'hard'] as const;
  const first = resolveRaid(...args, () => 0.25);
  const second = resolveRaid(...args, () => 0.25);
  assert.deepEqual(first, second);
  assert.equal(resolveRaid('unknown', 20, 38, 6, 0, inventory, 'hard', () => 0.25), null);
  for (const draw of [NaN, Infinity, -1, 1]) {
    assert.throws(() => checkForRaid(getInitialRaidState(), 4, () => draw), RangeError);
    assert.throws(() => resolveRaid(...args, () => draw), RangeError);
  }
});

test('fortified victory preserves the legacy two-draw sequence', () => {
  let draws = 0;
  const result = resolveRaid('criminal', 18, 18, 0, 1, {}, 'normal', () => {
    draws += 1;
    return 0.25;
  });
  assert.ok(result?.victory);
  assert.equal(draws, 2); // Raid name and original victory-line selection.
});
