import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { createRandomCursor } from '../../src/engine/random.ts';
import { planRatRun, scoreRatRun } from '../../src/engine/ratsInCellar.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('seeded rat spawns stay within the timed grid and replay from one cursor', () => {
  const first = createRandomCursor(42);
  const plan = planRatRun(first.next);
  const replay = createRandomCursor(42);
  assert.deepEqual(planRatRun(replay.next), plan);
  assert.equal(plan.length, 16);
  assert.deepEqual(plan[0], { atMs: 500, cellIndex: 9, visibilityMs: 1500 });
  assert.equal(first.state, 2775531210);
  assert.equal(first.draws, 32);
  for (let index = 0; index < plan.length; index++) {
    const spawn = plan[index]!;
    assert.ok(spawn.atMs >= 500 && spawn.atMs < 20_000);
    assert.ok(spawn.cellIndex >= 0 && spawn.cellIndex < 16);
    if (index > 0) {
      assert.ok(spawn.atMs - plan[index - 1]!.atMs >= 1000);
      assert.ok(spawn.atMs - plan[index - 1]!.atMs < 1500);
      assert.notEqual(spawn.cellIndex, plan[index - 1]!.cellIndex);
    }
  }
  assert.throws(() => planRatRun(() => 1), RangeError);
});

test('rat score derives the authored food loss and reward from bounded counts', () => {
  assert.deepEqual(scoreRatRun(0, 5, 16), {
    caught: 0, escaped: 5, foodLost: 10, reward: 0,
    rating: { min: 0, max: 5, label: 'The rats feast tonight.', reward: 0, foodPerEscape: 2 },
  });
  assert.equal(scoreRatRun(10, 5, 16)?.foodLost, 5);
  assert.equal(scoreRatRun(10, 5, 16)?.reward, 15);
  assert.equal(scoreRatRun(15, 1, 16)?.foodLost, 0);
  assert.equal(scoreRatRun(15, 1, 16)?.reward, 25);
  for (const [caught, escaped] of [[-1, 0], [1.5, 0], [15, 2], [1, Number.NaN]]) {
    assert.equal(scoreRatRun(caught, escaped, 16), null);
  }
});

test('legacy caller-supplied rat rewards and negative food losses cannot change state', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_RATS_RESULT',
    payload: { caught: 1_000_000, escaped: 0, foodLost: -1_000_000, reward: 1_000_000 },
  }), started);
});

test('reducer scores one seeded rat run and rejects forged, stale, repeated, or impossible results', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const action = { type: 'TAVERN_RATS_FINISH', payload: {
    caught: 0, escaped: 5, seed: started.rngState, reward: 1_000_000, foodLost: -1_000_000,
  } };
  const finished = gameReducer(started, action);
  assert.equal(finished.denarii, 700);
  assert.equal(finished.food, 470);
  assert.equal(finished.inventory.grain, 340);
  assert.equal(finished.tavern.ratsPlayedThisSeason, true);
  assert.equal(finished.tavern.ratsBestScore, 0);
  assert.equal(finished.rngState, 1887930711);
  assert.deepEqual(gameReducer(started, action), finished);
  assert.strictEqual(gameReducer(finished, action), finished);
  const saved = readV2Save(writeV2Save(finished));
  assert.equal(saved.ok, true);

  for (const payload of [
    { ...action.payload, seed: started.rngState + 1 },
    { ...action.payload, caught: 1_000_000 },
    { ...action.payload, caught: -1 },
    { ...action.payload, caught: 10, escaped: 10 },
    { ...action.payload, escaped: Number.NaN },
  ]) assert.strictEqual(gameReducer(started, { type: 'TAVERN_RATS_FINISH', payload }), started);
  assert.strictEqual(gameReducer(initialState, { type: 'TAVERN_RATS_FINISH', payload: action.payload }), initialState);
});

test('save import rejects corrupt Gambit and cellar counters without replacing older optional fields', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const envelope = JSON.parse(writeV2Save(started));
  for (const [field, value] of [
    ['gambitRoundsThisSeason', 6],
    ['gambitLastChoice', 'dagger'],
    ['ratsPlayedThisSeason', 'yes'],
    ['ratsBestScore', 21],
  ]) {
    const damaged = structuredClone(envelope);
    damaged.state.tavern[field as string] = value;
    assert.equal(readV2Save(JSON.stringify(damaged)).ok, false, `${field} should be rejected`);
  }
  const older = structuredClone(envelope);
  delete older.state.tavern.ratsBestScore;
  assert.equal(readV2Save(JSON.stringify(older)).ok, true);
});
