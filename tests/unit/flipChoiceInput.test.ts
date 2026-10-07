import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import type {GameCommand} from '../../src/engine/gameCommands.ts';
import seasonalEvents from '../../src/data/seasonalEvents.ts';
import randomEvents from '../../src/data/randomEvents.ts';
import {readV2Save, writeV2Save, type GameSnapshot} from '../../src/save/saveGame.ts';
import {rawGameReducer} from '../gameInput.ts';

const pools = {seasonalEvents: Object.values(seasonalEvents).flat(), randomEvents};

function next(state: GameSnapshot): GameCommand {
  switch (state.phase) {
    case 'management': return {type: 'SIMULATE_SEASON', payload: pools};
    case 'seasonal_action': return {type: 'SELECT_SEASONAL_ACTION', payload: {optionIndex: 0}};
    case 'seasonal_resolve': return {type: 'CONTINUE_TO_RANDOM', payload: pools};
    case 'random_event': return {type: 'SELECT_RANDOM_RESPONSE', payload: {optionIndex: 0}};
    case 'random_resolve': return {type: 'ADVANCE_TURN', payload: pools};
    case 'raid_warning': return {type: 'RAID_DEFEND'};
    case 'raid_result': return {type: 'RAID_CONTINUE'};
    case 'flip_intro': return {type: 'DISMISS_FLIP_INTRO'};
    case 'flip_decision': return {type: 'SELECT_FLIP_OPTION', payload: {optionIndex: 0}};
    case 'flip_outcome': return {type: 'CONTINUE_FLIP'};
    case 'flip_summary': return {type: 'DISMISS_FLIP_SUMMARY'};
    default: throw new Error(`Campaign ended before the required story: ${state.phase}`);
  }
}

function acquire(id: 'cyoa_lord' | 'serf_week') {
  let state = gameReducer(createInitialState(17),
    {type: 'START_GAME', payload: {seed: 17, difficulty: 'normal'}});
  if (id === 'serf_week') state = gameReducer(state, {type: 'SET_TAX_RATE', payload: {rate: 'high'}});
  let steps = 0;
  while (state.phase !== 'flip_intro' || state.currentFlipId !== id) {
    assert.ok(++steps < 300, 'Seeded acquisition must terminate.');
    state = gameReducer(state, next(state));
  }
  const choice = gameReducer(state, {type: 'DISMISS_FLIP_INTRO'});
  assert.equal(choice.phase, 'flip_decision');
  const saved = readV2Save(writeV2Save(choice));
  assert.ok(saved.ok);
  return saved.state;
}

for (const id of ['cyoa_lord', 'serf_week'] as const) {
  test(`${id} rejects malformed indices without changing an acquired saved decision`, () => {
    const state = acquire(id);
    const raw = writeV2Save(state);
    for (const optionIndex of ['0', [0], null, undefined, {}, true, -1, 0.5, NaN, Infinity,
      -Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER, 999]) {
      assert.strictEqual(rawGameReducer(state, {type: 'SELECT_FLIP_OPTION', payload: {optionIndex}}), state);
      assert.equal(writeV2Save(state), raw);
    }
    const chosen = gameReducer(state, {type: 'SELECT_FLIP_OPTION', payload: {optionIndex: 0}});
    assert.notStrictEqual(chosen, state);
    assert.equal(writeV2Save(state), raw, 'A legal choice must not mutate its input.');
    assert.equal(chosen.rngState, state.rngState, 'These authored first options are deterministic.');
    if (id === 'cyoa_lord') {
      assert.equal(chosen.currentCyoaNodeId, 'L2A');
      assert.equal(chosen.phase, 'flip_decision');
    } else {
      assert.equal(chosen.phase, 'flip_outcome');
      assert.deepEqual(chosen.currentFlipStats, {hunger: 50, energy: 55, family: 50});
      assert.deepEqual(chosen.flipConsequenceFlags, ['obedient_labor']);
    }
    const loaded = readV2Save(writeV2Save(chosen));
    assert.ok(loaded.ok);
    assert.equal(writeV2Save(loaded.state), writeV2Save(chosen));
  });
}
