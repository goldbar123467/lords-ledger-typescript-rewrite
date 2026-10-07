import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { invokeGameReducer } from '../gameInput.ts';
import { MORAL_DILEMMAS } from '../../src/data/chapel.ts';
import { writeV2Save } from '../../src/save/saveGame.ts';

function management() {
  return { ...createInitialState(104), phase: 'management' as const };
}

test('malformed tithes are atomic no-ops while finite fractional donations remain valid', () => {
  const state = management();
  const snapshot = structuredClone(state);
  for (const amount of ['50', 'abc', true, [], {}, NaN, Infinity, -1, 0, 501]) {
    assert.equal(gameReducer(state, { type: 'CHAPEL_PAY_TITHE', payload: { amount } }), state,
      `Rejected amount ${String(amount)}`);
  }
  assert.deepEqual(state, snapshot);
  assert.doesNotThrow(() => writeV2Save(state));
  const next = gameReducer(state, { type: 'CHAPEL_PAY_TITHE', payload: { amount: 0.5 } });
  assert.equal(next.denarii, 499.5);
  assert.equal(next.churchDonation, 0.5);
  assert.doesNotThrow(() => writeV2Save(next));
  const overflow = { ...state, denarii: Number.MAX_VALUE, churchDonation: Number.MAX_VALUE };
  assert.equal(gameReducer(overflow, { type: 'CHAPEL_PAY_TITHE', payload: { amount: Number.MAX_VALUE } }), overflow);
});

test('all paid Chapel choices require their complete authored cost', () => {
  let paid = 0;
  for (const dilemma of MORAL_DILEMMAS) {
    dilemma.choices.forEach((choice, choiceIndex) => {
      const cost = -(choice.effects.denarii ?? 0);
      if (cost <= 0) return;
      paid++;
      for (const denarii of [0, cost - 1, cost]) {
        const base = management();
        const state = { ...base, denarii, chapel: { ...base.chapel, currentDilemma: dilemma } };
        const snapshot = structuredClone(state);
        const next = gameReducer(state, { type: 'CHAPEL_RESOLVE_DILEMMA', payload: { choiceIndex } });
        if (denarii < cost) assert.equal(next, state, `${dilemma.id}/${choiceIndex} at ${denarii}d`);
        else {
          assert.equal(next.denarii, 0);
          assert.deepEqual(next.chapel.dilemmaResult, { text: choice.result, effects: choice.effects });
          assert.doesNotThrow(() => writeV2Save(next));
        }
        assert.deepEqual(state, snapshot);
      }
    });
  }
  assert.equal(paid, 6);
});

test('Chapel outcomes apply once and reject malformed choice indices', () => {
  const dilemma = MORAL_DILEMMAS[0];
  assert.ok(dilemma);
  const base = management();
  const state = { ...base, chapel: { ...base.chapel, currentDilemma: dilemma } };
  for (const choiceIndex of ['0', 'constructor', -1, 0.5, NaN, Infinity, 3]) {
    assert.equal(gameReducer(state, { type: 'CHAPEL_RESOLVE_DILEMMA', payload: { choiceIndex } }), state);
  }
  const action = { type: 'CHAPEL_RESOLVE_DILEMMA', payload: { choiceIndex: 0 } };
  const next = gameReducer(state, action);
  assert.deepEqual(next.chapel.dilemmasCompleted, [dilemma.id]);
  assert.equal(gameReducer(next, action), next);
  const completed = { ...next, chapel: { ...next.chapel, dilemmaResult: null } };
  assert.equal(gameReducer(completed, action), completed);
});

test('saved dilemma effect objects cannot replace the authoritative choice', () => {
  const dilemma = MORAL_DILEMMAS[0];
  assert.ok(dilemma);
  const base = management();
  const tampered = { ...dilemma, choices: [{ ...dilemma.choices[0], effects: { denarii: 10000 } }] };
  const state = { ...base, chapel: { ...base.chapel, currentDilemma: tampered } };
  const next = invokeGameReducer(state, { type: 'CHAPEL_RESOLVE_DILEMMA', payload: { choiceIndex: 0 } });
  assert.ok(next !== null && typeof next === 'object' && 'denarii' in next && 'chapel' in next);
  assert.equal(next.denarii, 500);
  assert.ok(next.chapel !== null && typeof next.chapel === 'object' && 'dilemmaResult' in next.chapel);
  assert.deepEqual(next.chapel.dilemmaResult, { text: dilemma.choices[0].result, effects: dilemma.choices[0].effects });
});
