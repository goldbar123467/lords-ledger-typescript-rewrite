import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkInvariants, parseArgs, runGame, STRATEGY_NAMES} from '../../playtest.ts';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../src/save/saveGame.ts';

for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  for (const strategy of STRATEGY_NAMES) {
    test(`headless ${strategy}/${difficulty} is a repeatable natural seeded campaign`, () => {
      const first = runGame(strategy, 104, difficulty);
      const repeated = runGame(strategy, 104, difficulty);
      assert.deepEqual(first.bugs, []);
      assert.ok(first.outcome === 'victory' || first.outcome === 'game_over', first.outcome);
      if (first.outcome === 'victory') assert.equal(first.finalTurn, 40);
      else assert.ok(first.gameOverReason);
      assert.deepEqual(repeated, first);
      assert.equal(writeV2Save(repeated.finalState), writeV2Save(first.finalState));
      assert.equal(first.turnHistory.length, first.finalTurn);
      assert.equal(first.actions[0]?.type, 'START_GAME');
      assert.ok(first.actions.length > first.finalTurn);
    });
  }
}

test('headless campaigns traverse actual raids and branching story content', () => {
  const result = runGame('passive', 104, 'normal');
  assert.ok(result.actions.some(action => action.type === 'RAID_DEFEND'));
  assert.ok(result.actions.some(action => action.type === 'RAID_CONTINUE'));
  assert.ok(Object.entries(result.finalState.perspectiveFlips).some(([id, seen]) => id.startsWith('cyoa_') && seen));
});

test('military and pious profiles use paid modern player commands rather than no-op aliases', () => {
  const military = runGame('military', 104, 'normal');
  assert.ok(military.actions.some(action => action.type === 'UPGRADE_FORTIFICATION' && action.changed));
  assert.ok(!military.actions.some(action => action.type === 'UPGRADE_CASTLE' || action.type === 'INSTALL_DEFENSE'));
  const pious = runGame('pious', 104, 'normal');
  assert.ok(pious.actions.some(action => action.type === 'CHAPEL_PAY_TITHE' && action.changed));
  assert.ok(!pious.actions.some(action => action.type === 'DONATE_TO_CHURCH'));
});

test('modern building instances and a legal zero-family ending do not trigger stale invariants', () => {
  const started = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
  assert.deepEqual(checkInvariants(started, 1, 'passive'), []);
  const ending = {...started, population: 0, phase: 'game_over' as const,
    gameOverReason: {type: 'depopulation' as const, reason: 'Controlled invariant fixture'}};
  assert.deepEqual(checkInvariants(ending, 1, 'passive'), []);
});

test('invariant probes reject nonfinite resources, bad calendar and premature victory', () => {
  const started = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
  assert.ok(checkInvariants({...started, denarii: Number.NaN}, 1, 'passive').some(message => /out of range/.test(message)));
  assert.ok(checkInvariants({...started, year: 999}, 1, 'passive').some(message => /Invalid calendar/.test(message)));
  assert.ok(checkInvariants({...started, phase: 'victory'}, 1, 'passive').some(message => /Premature victory/.test(message)));
});

test('CLI parser rejects malformed counts, seeds and difficulties without silently defaulting', () => {
  assert.deepEqual(parseArgs(['6', '4294967295', 'hard']), {runs: 6, seed: 0xffffffff, difficulty: 'hard'});
  for (const args of [['0'], ['-1'], ['1.5'], ['1junk'], ['1', '-1'], ['1', '4294967296'],
    ['1', ''], ['1', '104', 'impossible'], ['1', '104', 'normal', 'extra']]) {
    assert.throws(() => parseArgs(args));
  }
  const child = spawnSync(process.execPath, ['--experimental-strip-types',
    fileURLToPath(new URL('../../playtest.ts', import.meta.url)), '0'], {encoding: 'utf8'});
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Run count must be a positive safe integer/);
  assert.doesNotMatch(child.stdout, /WIN|No invariant violations/);
});
