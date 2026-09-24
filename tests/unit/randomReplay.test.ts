import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import seasonalEventData from '../../src/data/seasonalEvents.js';
import randomEvents from '../../src/data/randomEvents.js';

const events = { seasonalEvents: Object.values(seasonalEventData).flat(), randomEvents };

test('season transitions replay from a saved random state without ambient draws', () => {
  const ambientRandom = Math.random;
  Math.random = () => { throw new Error('gameplay used ambient randomness'); };
  try {
    const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'normal', seed: 123456789 } });
    const saved = readV2Save(writeV2Save(started));
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const action = { type: 'SIMULATE_SEASON', payload: events };
    const first = gameReducer(started, action);
    const replay = gameReducer(saved.state, action);
    assert.deepEqual(first, replay);
    assert.notEqual(first.rngState, started.rngState);
    assert.deepEqual(gameReducer(started, action), first);

    const persisted = readV2Save(writeV2Save(first));
    assert.equal(persisted.ok, true);
    if (persisted.ok) assert.deepEqual(persisted.state, JSON.parse(JSON.stringify(first)));

    let current = first;
    const remainingTurn = [
      { type: 'SELECT_SEASONAL_ACTION', payload: { optionIndex: 0 } },
      { type: 'CONTINUE_TO_RANDOM', payload: events },
      { type: 'SELECT_RANDOM_RESPONSE', payload: { optionIndex: 0 } },
      { type: 'ADVANCE_TURN', payload: events },
    ];
    for (const nextAction of remainingTurn) {
      const restored = readV2Save(writeV2Save(current));
      assert.equal(restored.ok, true, `${nextAction.type} must begin from a savable state`);
      if (!restored.ok) return;
      const next = gameReducer(current, nextAction);
      assert.deepEqual(next, gameReducer(restored.state, nextAction), `${nextAction.type} must replay after load`);
      current = next;
    }
    assert.equal(current.phase, 'management');
    assert.equal(current.turn, 2);
  } finally {
    Math.random = ambientRandom;
  }
});

test('chance based raid defense and chapel actions replay from the same state', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { seed: 987654321 } });
  const warning = {
    ...started,
    turn: 3,
    season: 'autumn',
    raids: { ...started.raids, activeRaid: { type: 'criminal', phase: 'warning', result: null } },
    phase: 'raid_warning',
  };
  const defended = gameReducer(warning, { type: 'RAID_DEFEND' });
  assert.deepEqual(defended, gameReducer(warning, { type: 'RAID_DEFEND' }));
  assert.notEqual(defended.rngState, warning.rngState);

  const chapel = gameReducer(started, { type: 'CHAPEL_START_DILEMMA' });
  assert.deepEqual(chapel, gameReducer(started, { type: 'CHAPEL_START_DILEMMA' }));
  assert.notEqual(chapel.rngState, started.rngState);
});
