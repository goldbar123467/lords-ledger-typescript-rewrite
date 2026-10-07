import assert from 'node:assert/strict';
import test from 'node:test';
import { planManuscriptAction, type ManuscriptChapel, type ManuscriptCommand } from '../../src/engine/chapelManuscript.ts';

test('checked manuscript planner rejects invalid commands before drawing randomness', () => {
  const random = () => { throw new Error('invalid command drew randomness'); };
  const types: ManuscriptCommand[] = ['CHAPEL_MS_START', 'CHAPEL_MS_FLASH', 'CHAPEL_MS_CLEAR_FLASH', 'CHAPEL_MS_DONE_SHOWING', 'CHAPEL_MS_INPUT'];
  for (const type of types) assert.equal(planManuscriptAction({ phase: 'victory' as const, denarii: 0 }, type, {}, random), null);
  const chapel: ManuscriptChapel = { view: 'manuscript', msPhase: 'input', msPattern: [0, 1, 2], msPlayerInput: [] };
  for (const index of ['0', null, -1, 8, NaN]) {
    assert.equal(planManuscriptAction({ phase: 'management' as const, denarii: 0, chapel }, 'CHAPEL_MS_INPUT', { index }, random), null);
  }
  assert.deepEqual(planManuscriptAction({ phase: 'management' as const, denarii: 0, chapel }, 'CHAPEL_MS_INPUT', { index: 0 }, random), { chapel: { msPlayerInput: [0] } });
});

test('domain outcome preserves capped local meters, quill reward and exact fact draw count', () => {
  for (const quill of [false, true]) {
    let draws = 0;
    const chapel: ManuscriptChapel = {
      view: 'manuscript', msPhase: 'input', msRound: 4, msPattern: [0, 1, 2, 3, 4, 5],
      msPlayerInput: [0, 1, 2, 3, 4], inventory: quill ? ['quill_ink'] : [], faith: 99, piety: 99,
    };
    const snapshot = structuredClone(chapel);
    const outcome = planManuscriptAction({ phase: 'management' as const, denarii: 7, chapel }, 'CHAPEL_MS_INPUT', { index: 5 }, () => { draws++; return 0; });
    assert.ok(outcome);
    assert.equal(draws, 1);
    assert.equal(outcome.denarii, quill ? 27 : 22);
    assert.equal(outcome.chapel.faith, 100);
    assert.equal(outcome.chapel.piety, 100);
    assert.equal(outcome.chapel.msPhase, 'success');
    assert.ok(outcome.logText?.includes(quill ? '+20d' : '+15d'));
    assert.deepEqual(chapel, snapshot);
  }
});
