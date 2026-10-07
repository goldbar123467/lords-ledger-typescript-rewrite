import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { checkedGameReducer } from '../../src/engine/checkedGameReducer.ts';
import { assertGameSnapshot, readV2Save, writeV2Save, type GameSnapshot } from '../../src/save/saveGame.ts';
import type { GameCommand } from '../../src/engine/gameCommands.ts';
import seasonalEvents from '../../src/data/seasonalEvents.ts';
import randomEvents from '../../src/data/randomEvents.ts';

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}
function initial(seed: number): GameSnapshot {
  const value: unknown = createInitialState(seed);
  assertGameSnapshot(value);
  return value;
}
const pools = { seasonalEvents: Object.values(seasonalEvents).flat(), randomEvents };
function nextCommand(state: GameSnapshot): GameCommand {
  switch (state.phase) {
    case 'management': return { type: 'SIMULATE_SEASON', payload: pools };
    case 'seasonal_action': return { type: 'SELECT_SEASONAL_ACTION', payload: { optionIndex: 0 } };
    case 'seasonal_resolve': return { type: 'CONTINUE_TO_RANDOM', payload: pools };
    case 'random_event': return { type: 'SELECT_RANDOM_RESPONSE', payload: { optionIndex: 0 } };
    case 'random_resolve': return { type: 'ADVANCE_TURN', payload: pools };
    case 'raid_warning': return { type: 'RAID_DEFEND' };
    case 'raid_result': return { type: 'RAID_CONTINUE' };
    case 'flip_intro': return { type: 'DISMISS_FLIP_INTRO' };
    case 'flip_decision': return { type: 'SELECT_FLIP_OPTION', payload: { optionIndex: 0 } };
    case 'flip_outcome': return { type: 'CONTINUE_FLIP' };
    case 'flip_summary': return { type: 'DISMISS_FLIP_SUMMARY' };
    default: throw new Error(`Unexpected live phase ${state.phase}`);
  }
}

test('the in-memory boundary preserves identity and rejects missing RNG without migration', () => {
  const state = initial(104), before = JSON.stringify(state);
  freeze(state);
  assertGameSnapshot(state);
  assert.equal(checkedGameReducer(state, { type: 'UPGRADE_CASTLE' }), state);
  assert.equal(checkedGameReducer(state, { type: 'INSTALL_DEFENSE', payload: { historical: true } }), state);
  assert.equal(JSON.stringify(state), before);
  const { rngState: removed, ...legacy } = state;
  assert.equal(typeof removed, 'number');
  assert.throws(() => assertGameSnapshot(legacy), /random cursor/);
  assert.throws(() => assertGameSnapshot({ ...state, rngState: -1 }), /random/);
  assert.throws(() => assertGameSnapshot({ ...state, inventory: [] }), /inventory/i);
  assert.equal(Object.hasOwn(legacy, 'rngState'), false);
});

for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  for (const seed of [1, 17, 104, 0xffffffff]) test(`checked output matches raw transitions: ${difficulty}, seed ${seed}`, () => {
    let state = initial(seed);
    function apply(command: GameCommand): void {
      const before = JSON.stringify(state);
      freeze(state);
      const expected: unknown = gameReducer(state, command);
      assertGameSnapshot(expected);
      const actual = checkedGameReducer(state, command);
      assert.deepEqual(actual, expected);
      assert.equal(writeV2Save(actual), writeV2Save(expected));
      assert.equal(JSON.stringify(state), before, `Input mutated by ${command.type}`);
      if (expected === state) assert.equal(actual, state);
      state = actual;
    }
    apply({ type: 'START_GAME', payload: { ...pools, difficulty, seed } });
    apply({ type: 'DISMISS_TUTORIAL', payload: { tab: 'estate' } });
    for (const tab of ['estate', 'market', 'military', 'people', 'hall', 'chapel', 'forge', 'chronicle', 'map'] as const) {
      apply({ type: 'SET_TAB', payload: { tab } });
    }
    apply({ type: 'BUY_RESOURCE', payload: { resource: 'wood', quantity: 1 } });
    apply({ type: 'SELL_RESOURCE', payload: { resource: 'wood', quantity: 1 } });
    apply({ type: 'TAVERN_VISIT' });
    apply({ type: 'BLACKSMITH_VISIT' });
    // A fixed first-choice policy checks generated state, not strategic quality or final campaign acceptance.
    let steps = 0;
    while (state.phase !== 'victory' && state.phase !== 'game_over' && steps < 500) {
      const previous = state;
      apply(nextCommand(state));
      assert.notEqual(state, previous, `Stalled in ${state.phase}`);
      steps++;
    }
    assert.ok(state.phase === 'victory' || state.phase === 'game_over', 'Policy must reach a terminal state');
    const loaded = readV2Save(writeV2Save(state));
    if (!loaded.ok) throw new Error(loaded.error);
    apply({ type: 'LOAD_SAVE', payload: { savedState: loaded.state } });
    apply({ type: 'PLAY_AGAIN', payload: { ...pools, difficulty, seed } });
    assert.equal(state.phase, 'management');
    assert.equal(state.turn, 1);
  });
}
