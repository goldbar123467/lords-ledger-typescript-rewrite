import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { MORAL_DILEMMAS } from '../../src/data/chapel.ts';
import { seedLegacySnapshot } from '../../src/engine/random.ts';
import type { ChapelSaveState } from '../../src/engine/chapelState.ts';

function fixture() {
  const base = createInitialState(104);
  const chapel: ChapelSaveState = { ...base.chapel, view: 'nave', msPhase: 'idle', msRound: 1, msMaxRound: 4 };
  return { ...base, phase: 'management', chapel };
}
function envelope(state: unknown) { return JSON.stringify({ format: 'lords-ledger', version: 2, state }); }

test('every legal manuscript transition and Chapel choice remains exactly savable', () => {
  for (const quill of [false, true]) {
    let state = fixture();
    state = { ...state, chapel: { ...state.chapel, inventory: quill ? ['quill_ink'] : [] } };
    const dispatch = (action: { type: string; payload?: { index: number } }) => {
      state = gameReducer(state, action);
      const read = readV2Save(writeV2Save(state));
      assert.ok(read.ok);
      assert.deepEqual(read.state, state);
    };
    dispatch({ type: 'CHAPEL_MS_START' });
    for (let round = 1; round <= 4; round++) {
      const pattern = state.chapel.msPattern;
      assert.ok(pattern);
      for (const index of pattern) {
        dispatch({ type: 'CHAPEL_MS_FLASH', payload: { index } });
        dispatch({ type: 'CHAPEL_MS_CLEAR_FLASH' });
      }
      dispatch({ type: 'CHAPEL_MS_DONE_SHOWING' });
      for (const index of pattern) dispatch({ type: 'CHAPEL_MS_INPUT', payload: { index } });
    }
    dispatch({ type: 'CHAPEL_MS_START' });
    dispatch({ type: 'CHAPEL_MS_DONE_SHOWING' });
    const first = state.chapel.msPattern?.[0];
    assert.ok(first !== undefined);
    dispatch({ type: 'CHAPEL_MS_INPUT', payload: { index: (first + 1) % 8 } });
  }
  for (const dilemma of MORAL_DILEMMAS) for (let choiceIndex = 0; choiceIndex < dilemma.choices.length; choiceIndex++) {
    const base = fixture();
    const pending = { ...base, chapel: { ...base.chapel, view: 'dilemma', currentDilemma: dilemma } };
    assert.ok(readV2Save(writeV2Save(pending)).ok);
    const resolved = gameReducer(pending, { type: 'CHAPEL_RESOLVE_DILEMMA', payload: { choiceIndex } });
    const read = readV2Save(writeV2Save(resolved));
    assert.ok(read.ok);
    assert.deepEqual(read.state, resolved);
  }
});

test('nested ownership, meters, dialogue, pending content and logs reject malformed saves', () => {
  const base = fixture();
  for (const patch of [
    { inventory: {} }, { inventory: ['quill_ink', 'quill_ink'] }, { inventory: ['fake'] },
    { dilemmasCompleted: ['fake'] }, { dilemmasCompleted: ['starving_widow', 'starving_widow'] },
    { piety: '30' }, { happiness: 101 }, { anselmGreeting: {} }, { titheResponse: [] },
    { titheAmount: -1 }, { spicePurchasesThisYear: 0.5 }, { view: 'fake' },
    { gameLog: [{ text: 'x', turn: 1, season: 'fake' }] }, { gameLog: {} },
    { currentDilemma: { id: 'starving_widow' } }, { view: 'dilemma', currentDilemma: null },
    { dilemmaResult: { text: 'free reward', effects: { denarii: 1000 } } },
  ]) {
    const state = { ...base, chapel: { ...base.chapel, ...patch } };
    assert.throws(() => writeV2Save(state), /Chapel/i);
    for (const read of [readV2Save(envelope(state)), readLegacySave(JSON.stringify(state))]) {
      assert.equal(read.ok, false);
      if (!read.ok) assert.equal(read.canRestartManuscript, undefined);
    }
  }
});

test('damaged manuscript recovery is explicit, isolated and preserves resources, logs and RNG', () => {
  const started = gameReducer(fixture(), { type: 'CHAPEL_MS_START' });
  for (const patch of [{ msPlayerInput: [null] }, { msPattern: [0, null, 2] }, { msRound: 999 },
    { msPhase: {} }, { msReward: 1000 }, { msPattern: new Array(3) }]) {
    const state = { ...started, chapel: { ...started.chapel, ...patch } };
    const snapshot = structuredClone(state);
    const raw = envelope(state);
    const result = readV2Save(raw);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.canRestartManuscript, true);
    const repaired = readV2Save(raw, { restartManuscript: true });
    assert.ok(repaired.ok);
    assert.deepEqual(repaired.state, { ...JSON.parse(raw).state, chapel: { ...JSON.parse(raw).state.chapel,
      view: 'nave', msPhase: 'idle', msRound: 1, msMaxRound: 4, msPattern: [], msPlayerInput: [],
      msActiveSymbol: null, msFact: null, msReward: 0 } });
    assert.equal(repaired.state.rngState, started.rngState);
    assert.deepEqual(state, snapshot);
    assert.equal(envelope(state), raw);
    assert.ok(readV2Save(writeV2Save(repaired.state)).ok);
    const restarted = gameReducer(repaired.state, { type: 'CHAPEL_MS_START' });
    assert.equal(restarted.chapel.msPhase, 'showing');
    assert.equal(restarted.chapel.msPattern.length, 3);
  }
  const damaged = { ...started, taxRate: 'fake', chapel: { ...started.chapel, msPlayerInput: [null] } };
  const blocked = readV2Save(envelope(damaged), { restartManuscript: true });
  assert.equal(blocked.ok, false);
});

test('legacy optional/null Chapel fields survive and missing RNG is seeded before recovery', () => {
  const base = fixture();
  const chapel = { faith: 50, view: null, piety: null, inventory: null, dilemmasCompleted: null, gameLog: null };
  const partial = { ...base, chapel };
  const loaded = readLegacySave(JSON.stringify(partial));
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state, partial);
  const started = gameReducer(base, { type: 'CHAPEL_MS_START' });
  const { rngState, ...old } = started;
  assert.equal(typeof rngState, 'number');
  const damaged = { ...old, chapel: { ...started.chapel, msPlayerInput: [null] } };
  const raw = JSON.stringify(damaged);
  const repaired = readLegacySave(raw, { restartManuscript: true });
  assert.ok(repaired.ok);
  assert.equal(repaired.state.rngState, seedLegacySnapshot(damaged));
  assert.equal(JSON.stringify(damaged), raw);
});
