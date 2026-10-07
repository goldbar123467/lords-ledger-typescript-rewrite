import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import type {GameCommand} from '../../src/engine/gameCommands.ts';
import {readV2Save, writeV2Save, type GamePhase} from '../../src/save/saveGame.ts';
import seasonalEvents from '../../src/data/seasonalEvents.ts';
import randomEvents from '../../src/data/randomEvents.ts';

const pools = {seasonalEvents: Object.values(seasonalEvents).flat(), randomEvents};
const transitions: readonly {phase: GamePhase; command: GameCommand}[] = [
  {phase: 'management', command: {type: 'SIMULATE_SEASON', payload: pools}},
  {phase: 'seasonal_action', command: {type: 'SELECT_SEASONAL_ACTION', payload: {optionIndex: 0}}},
  {phase: 'seasonal_resolve', command: {type: 'CONTINUE_TO_RANDOM', payload: pools}},
  {phase: 'random_event', command: {type: 'SELECT_RANDOM_RESPONSE', payload: {optionIndex: 0}}},
  {phase: 'random_resolve', command: {type: 'ADVANCE_TURN', payload: pools}},
  {phase: 'raid_warning', command: {type: 'RAID_DEFEND'}},
  {phase: 'raid_result', command: {type: 'RAID_CONTINUE'}},
  {phase: 'flip_intro', command: {type: 'DISMISS_FLIP_INTRO'}},
  {phase: 'flip_decision', command: {type: 'SELECT_FLIP_OPTION', payload: {optionIndex: 0}}},
  {phase: 'flip_outcome', command: {type: 'CONTINUE_FLIP'}},
  {phase: 'flip_summary', command: {type: 'DISMISS_FLIP_SUMMARY'}},
];

function seasonalResolution(seed: number) {
  const started = gameReducer(createInitialState(seed), {type: 'START_GAME', payload: {seed, difficulty: 'easy'}});
  const simulated = gameReducer(started, {type: 'SIMULATE_SEASON', payload: pools});
  assert.equal(simulated.phase, 'seasonal_action');
  const resolved = gameReducer(simulated, {type: 'SELECT_SEASONAL_ACTION', payload: {optionIndex: 0}});
  assert.equal(resolved.phase, 'seasonal_resolve');
  return resolved;
}

test('calendar advance cannot bypass an acquired seasonal resolution or pending random choice', () => {
  for (const seed of [0, 1, 4, 17, 104]) {
    const state = seasonalResolution(seed);
    const raw = writeV2Save(state);
    const loaded = readV2Save(raw);
    assert.ok(loaded.ok);
    assert.equal(gameReducer(loaded.state, {type: 'ADVANCE_TURN', payload: pools}) === loaded.state, true);
    assert.equal(writeV2Save(loaded.state), raw);
    const pending = gameReducer(loaded.state, {type: 'CONTINUE_TO_RANDOM', payload: pools});
    assert.equal(pending.phase, 'random_event');
    assert.equal(pending.turn, state.turn);
    assert.ok(pending.currentRandomEvent);
    assert.strictEqual(gameReducer(pending, {type: 'ADVANCE_TURN', payload: pools}), pending);
    assert.strictEqual(gameReducer(pending, {type: 'CONTINUE_TO_RANDOM', payload: pools}), pending);
    const chosen = gameReducer(pending, {type: 'SELECT_RANDOM_RESPONSE', payload: {optionIndex: 0}});
    assert.equal(chosen.phase, 'random_resolve');
    assert.strictEqual(gameReducer(chosen, {type: 'SELECT_RANDOM_RESPONSE', payload: {optionIndex: 0}}), chosen);
    const advanced = gameReducer(chosen, {type: 'ADVANCE_TURN', payload: pools});
    assert.equal(advanced.turn, state.turn + 1);
    assert.strictEqual(gameReducer(advanced, {type: 'ADVANCE_TURN', payload: pools}), advanced);
    assert.equal(readV2Save(writeV2Save(advanced)).ok, true);
  }
});

test('an empty random pool still resolves its stage before exactly one calendar advance', () => {
  const state = seasonalResolution(104);
  assert.equal(gameReducer(state, {type: 'ADVANCE_TURN'}) === state, true);
  const resolved = gameReducer(state, {type: 'CONTINUE_TO_RANDOM', payload: {randomEvents: []}});
  assert.equal(resolved.phase, 'random_resolve');
  assert.equal(resolved.currentRandomEvent, null);
  assert.equal(resolved.turn, state.turn);
  assert.equal(resolved.rngState, state.rngState);
  const advanced = gameReducer(resolved, {type: 'ADVANCE_TURN'});
  assert.equal(advanced.turn, state.turn + 1);
  assert.strictEqual(gameReducer(advanced, {type: 'ADVANCE_TURN'}), advanced);
});

for (const scenario of [{difficulty: 'normal', seed: 17}, {difficulty: 'hard', seed: 23}] as const) {
  test(`${scenario.difficulty} acquired phases reject wrong and completed core continuations`, () => {
    let state = gameReducer(createInitialState(scenario.seed), {type: 'START_GAME', payload: scenario});
    let steps = 0;
    while (state.phase !== 'victory' && state.phase !== 'game_over') {
      assert.ok(++steps <= 500, 'First-choice policy must terminate.');
      const raw = writeV2Save(state);
      for (const entry of transitions) if (entry.phase !== state.phase) {
        assert.equal(gameReducer(state, entry.command) === state, true, `${entry.command.type} in ${state.phase}`);
        assert.equal(writeV2Save(state), raw);
      }
      const entry = transitions.find(candidate => candidate.phase === state.phase);
      assert.ok(entry, `No legal transition for ${state.phase}`);
      const previous = state;
      state = gameReducer(state, entry.command);
      assert.notStrictEqual(state, previous);
      assert.equal(writeV2Save(previous), raw, 'Legal action mutated its input.');
      const saved = writeV2Save(state);
      const loaded = readV2Save(saved);
      assert.ok(loaded.ok);
      assert.equal(writeV2Save(loaded.state), saved);
      if (state.phase !== previous.phase) {
        assert.strictEqual(gameReducer(state, entry.command), state, 'Completed-phase continuation must be inert.');
      } else {
        // A CYOA node presents a new choice while retaining the same decision phase.
        assert.equal(state.phase, 'flip_decision');
        assert.notEqual(state.currentCyoaNodeId, previous.currentCyoaNodeId);
      }
    }
    const terminalRaw = writeV2Save(state);
    const commands: readonly GameCommand[] = [...transitions.map(entry => entry.command),
      {type: 'BUY_RESOURCE', payload: {resource: 'grain', quantity: 1}},
      {type: 'SELL_RESOURCE', payload: {resource: 'grain', quantity: 1}},
      {type: 'DONATE_TO_CHURCH', payload: {amount: 1}},
      {type: 'TAVERN_MARTA_NEXT'}, {type: 'BLACKSMITH_TALK'}];
    for (const command of commands) {
      assert.strictEqual(gameReducer(state, command), state);
      assert.equal(writeV2Save(state), terminalRaw);
    }
  });
}
