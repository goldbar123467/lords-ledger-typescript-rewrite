import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('stranger trade cannot accept caller prices or invent an offer', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_STRANGER_TRADE', payload: { cost: -1_000_000, foodReward: 1_000_000 },
  }), started);
  assert.strictEqual(gameReducer(started, { type: 'TAVERN_STRANGER_DISMISS' }), started);
});

test('a seeded stranger offer persists until one canonical trade or dismissal', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 2 } });
  const visited = gameReducer(started, { type: 'TAVERN_VISIT' });
  assert.equal(visited.tavern.pendingStrangerEncounter, 'trade');
  assert.equal(visited.rngState, 2143695500);
  assert.equal(visited.tavern.totalVisits, 1);
  assert.deepEqual(gameReducer(started, { type: 'TAVERN_VISIT' }), visited);
  const revisited = gameReducer(visited, { type: 'TAVERN_VISIT' });
  assert.equal(revisited.tavern.pendingStrangerEncounter, 'trade');
  assert.equal(revisited.rngState, visited.rngState);
  const loaded = readV2Save(writeV2Save(visited));
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.state.tavern.pendingStrangerEncounter, 'trade');
  const poor = { ...visited, denarii: 149 };
  assert.strictEqual(gameReducer(poor, { type: 'TAVERN_STRANGER_TRADE' }), poor);
  const wrongPhase = { ...visited, phase: 'title' };
  assert.strictEqual(gameReducer(wrongPhase, { type: 'TAVERN_STRANGER_TRADE' }), wrongPhase);

  const traded = gameReducer(visited, {
    type: 'TAVERN_STRANGER_TRADE', payload: { cost: -1_000_000, foodReward: 1_000_000 },
  });
  assert.equal(traded.denarii, 550);
  assert.equal(traded.inventory.grain, 360);
  assert.equal(traded.food, 490);
  assert.equal(traded.tavern.strangerAppearedThisSeason, true);
  assert.equal(traded.tavern.pendingStrangerEncounter, null);
  assert.strictEqual(gameReducer(traded, { type: 'TAVERN_STRANGER_TRADE' }), traded);
  assert.strictEqual(gameReducer(traded, { type: 'TAVERN_STRANGER_DISMISS' }), traded);

  const dismissed = gameReducer(visited, { type: 'TAVERN_STRANGER_DISMISS' });
  assert.equal(dismissed.denarii, 700);
  assert.equal(dismissed.tavern.pendingStrangerEncounter, null);
  assert.equal(dismissed.tavern.strangerAppearedThisSeason, true);
  assert.match(dismissed.chronicle.at(-1)?.text ?? '', /declined.*provisions/i);
  assert.strictEqual(gameReducer(dismissed, { type: 'TAVERN_STRANGER_DISMISS' }), dismissed);
});

test('corrupt pending stranger encounters cannot load', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 2 } });
  const visited = gameReducer(started, { type: 'TAVERN_VISIT' });
  const envelope = JSON.parse(writeV2Save(visited));
  for (const [pending, appeared] of [['dragon', false], ['trade', true]]) {
    const damaged = structuredClone(envelope);
    damaged.state.tavern.pendingStrangerEncounter = pending;
    damaged.state.tavern.strangerAppearedThisSeason = appeared;
    assert.equal(readV2Save(JSON.stringify(damaged)).ok, false);
  }
  const older = structuredClone(envelope);
  delete older.state.tavern.pendingStrangerEncounter;
  assert.equal(readV2Save(JSON.stringify(older)).ok, true);
});
