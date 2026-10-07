import type {GameSnapshot} from '../../src/save/saveGame.ts';
import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { getManuscriptRound } from '../../src/engine/chapelManuscript.ts';

function management(quill = false): GameSnapshot {
  const base = createInitialState(104);
  return { ...base, phase: 'management' as const, chapel: { ...base.chapel, inventory: quill ? ['quill_ink'] : [] } };
}

function completeRun(state: GameSnapshot) {
  let current = gameReducer(state, { type: 'CHAPEL_MS_START' });
  for (let round = 1; round <= 4; round++) {
    assert.equal(current.chapel.msRound, round);
    assert.equal(present(current.chapel.msPattern, "current.chapel.msPattern").length, round + 2);
    const pattern = [...present(current.chapel.msPattern, "current.chapel.msPattern")];
    for (const index of pattern) {
      current = gameReducer(current, { type: 'CHAPEL_MS_FLASH', payload: { index } });
      current = gameReducer(current, { type: 'CHAPEL_MS_CLEAR_FLASH' });
    }
    current = gameReducer(current, { type: 'CHAPEL_MS_DONE_SHOWING' });
    for (const index of pattern) current = gameReducer(current, { type: 'CHAPEL_MS_INPUT', payload: { index } });
  }
  return current;
}

test('four authored rounds reward once per run and legitimate retries stay available', () => {
  for (const quill of [false, true]) {
    const state = management(quill);
    const snapshot = structuredClone(state);
    const reward = quill ? 20 : 15;
    const next = completeRun(state);
    assert.equal(next.chapel.msPhase, 'success');
    assert.equal(next.chapel.msReward, reward);
    assert.equal(next.denarii, 500 + reward);
    assert.equal(next.chapel.faith, 55);
    assert.equal(next.chapel.piety, 33);
    assert.equal(present(next.chapel.gameLog, "next.chapel.gameLog").length, 1);
    assert.deepEqual(state, snapshot);
    const second = completeRun(next);
    assert.equal(second.denarii, 500 + reward * 2);
    assert.equal(present(second.chapel.gameLog, "second.chapel.gameLog").length, 2);
    assert.doesNotThrow(() => writeV2Save(second));
  }
});

test('manuscript commands outside management cannot spend RNG or change durable state', () => {
  const started = gameReducer(management(), { type: 'CHAPEL_MS_START' });
  for (const phase of ['title', 'event', 'resolve', 'raid', 'gameover', 'victory']) {
    const state = { ...started, phase };
    const snapshot = structuredClone(state);
    for (const type of ['CHAPEL_MS_START', 'CHAPEL_MS_FLASH', 'CHAPEL_MS_CLEAR_FLASH', 'CHAPEL_MS_DONE_SHOWING', 'CHAPEL_MS_INPUT']) {
      assert.equal(gameReducer(state, { type, payload: { index: 0 } }), state, `${type}/${phase}`);
    }
    assert.deepEqual(state, snapshot);
  }
});

test('stale timer callbacks and terminal replay cannot reopen a rewarded manuscript', () => {
  const initial = management();
  assert.equal(gameReducer(initial, { type: 'CHAPEL_MS_DONE_SHOWING' }), initial);
  const done = completeRun(initial);
  for (const type of ['CHAPEL_MS_FLASH', 'CHAPEL_MS_CLEAR_FLASH', 'CHAPEL_MS_DONE_SHOWING', 'CHAPEL_MS_INPUT']) {
    assert.equal(gameReducer(done, { type, payload: { index: undefined } }), done, type);
  }
  const showing = gameReducer(initial, { type: 'CHAPEL_MS_START' });
  const away = gameReducer(showing, { type: 'CHAPEL_SET_VIEW', payload: { view: 'nave' } });
  for (const type of ['CHAPEL_MS_FLASH', 'CHAPEL_MS_CLEAR_FLASH', 'CHAPEL_MS_DONE_SHOWING', 'CHAPEL_MS_INPUT']) {
    assert.equal(gameReducer(away, { type, payload: { index: 0 } }), away, type);
  }
});

test('invalid symbols and inconsistent saved prefixes reject without a failure draw', () => {
  const showing = gameReducer(management(), { type: 'CHAPEL_MS_START' });
  const input = gameReducer(showing, { type: 'CHAPEL_MS_DONE_SHOWING' });
  for (const index of [undefined, '0', null, -1, 8, 0.5, NaN, Infinity, {}, []]) {
    assert.equal(gameReducer(input, { type: 'CHAPEL_MS_INPUT', payload: { index } }), input);
    assert.equal(gameReducer(showing, { type: 'CHAPEL_MS_FLASH', payload: { index } }), showing);
  }
  for (const patch of [{ msPattern: [] }, { msRound: 0 }, { msRound: 5 }, { msMaxRound: 1 },
    { msPattern: [0, 1, '2'] }, { msPlayerInput: [...present(input.chapel.msPattern, 'complete pattern')] },
    { msPlayerInput: [(present(present(input.chapel.msPattern, "input.chapel.msPattern")[0], "present(input.chapel.msPattern, \"input.chapel.msPattern\")[0]") + 1) % 8] }]) {
    const state = { ...input, chapel: { ...input.chapel, ...patch } };
    assert.equal(gameReducer(state, { type: 'CHAPEL_MS_INPUT', payload: { index: 0 } }), state);
  }
});

test('partial manuscript save resumes the same prefix, RNG and outcome; mistakes keep zero penalty', () => {
  const showing = gameReducer(management(), { type: 'CHAPEL_MS_START' });
  const input = gameReducer(showing, { type: 'CHAPEL_MS_DONE_SHOWING' });
  const pattern = [...present(input.chapel.msPattern, 'resumed manuscript pattern')];
  const partial = gameReducer(input, { type: 'CHAPEL_MS_INPUT', payload: { index: pattern[0] } });
  const loaded = readV2Save(writeV2Save(partial));
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state, partial);
  const action = { type: 'CHAPEL_MS_INPUT', payload: { index: pattern[1] } };
  assert.deepEqual(gameReducer(loaded.state, action), gameReducer(partial, action));
  const failed = gameReducer(input, { type: 'CHAPEL_MS_INPUT', payload: { index: (present(pattern[0], 'first pattern symbol') + 1) % 8 } });
  assert.equal(failed.chapel.msPhase, 'fail');
  assert.equal(failed.denarii, 500);
  assert.equal(failed.chapel.faith, 50);
  assert.equal(failed.chapel.piety, 30);
  assert.equal(failed.chapel.msReward, 0);
  assert.equal(present(failed.chapel.gameLog, "failed.chapel.gameLog").length, 0);
  assert.equal(typeof failed.chapel.msFact, 'string');
});

test('sparse and inherited symbol slots cannot validate or create a null saved prefix', () => {
  const showing = gameReducer(management(), { type: 'CHAPEL_MS_START' });
  const input = gameReducer(showing, { type: 'CHAPEL_MS_DONE_SHOWING' });
  const inherited = new Array<number>(3);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: 0, 1: 1, 2: 2 }));
  for (const patch of [{ msPattern: new Array<number>(3) }, { msPattern: [0, , 2] },
    { msPattern: inherited }, { msPlayerInput: new Array<number>(1) }]) {
    for (const base of [showing, input]) {
      const state = { ...base, chapel: { ...base.chapel, ...patch } };
      const raw = JSON.stringify(state);
      assert.throws(() => writeV2Save(state), /manuscript/i);
      assert.equal(getManuscriptRound(state.chapel), null);
      for (const type of ['CHAPEL_MS_FLASH', 'CHAPEL_MS_CLEAR_FLASH', 'CHAPEL_MS_DONE_SHOWING', 'CHAPEL_MS_INPUT']) {
        assert.equal(gameReducer(state, { type, payload: { index: present(input.chapel.msPattern, "input.chapel.msPattern")[1] } }), state);
      }
      assert.equal(JSON.stringify(state), raw);
      assert.throws(() => writeV2Save(state), /manuscript/i);
    }
  }
});
