import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { nextBardContent } from '../../src/engine/tavernBard.ts';
import { BARD_TALES } from '../../src/data/tavern.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('an unverified solved-riddle command cannot repeat a coin reward', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  assert.strictEqual(gameReducer(started, { type: 'TAVERN_BARD_RIDDLE_SOLVED' }), started);
});

test('seeded Bard content preserves the authored mix and cycles tales without repeats', () => {
  const comment = nextBardContent(() => 0.7, [], 0, 13);
  assert.deepEqual(comment?.content, { type: 'comment', index: 13 });
  const draws = [0.9, 0.2, 0, 0.99];
  const riddle = nextBardContent(() => {
    const value = draws.shift();
    if (value === undefined) throw new Error('Unexpected extra Bard draw.');
    return value;
  }, [], 0, 0);
  assert.equal(riddle?.content.type, 'riddle');
  if (riddle?.content.type === 'riddle') {
    assert.equal(riddle.content.id, 'map_without_houses');
    assert.deepEqual([...riddle.content.optionOrder].sort(), [0, 1, 2]);
  }
  assert.throws(() => nextBardContent(() => Number.NaN, [], 0, 0), RangeError);

  let remaining: number[] = [];
  let served = 0;
  const indices: number[] = [];
  for (let count = 0; count < BARD_TALES.length + 1; count++) {
    const next = nextBardContent(() => 0, remaining, served, 0);
    assert.equal(next?.content.type, 'tale');
    if (!next || next.content.type !== 'tale') throw new Error('Expected a tale.');
    indices.push(next.content.index);
    assert.equal(next.content.repeat, count >= BARD_TALES.length);
    remaining = next.talesRemaining;
    served = next.talesServed;
  }
  assert.equal(new Set(indices.slice(0, BARD_TALES.length)).size, BARD_TALES.length);
  assert.equal(indices[0], indices[BARD_TALES.length]);
});

test('a seeded riddle pays once for its stable ID, including after save and repeat', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 5 } });
  const visited = gameReducer(started, { type: 'TAVERN_VISIT' });
  const offered = gameReducer(visited, { type: 'TAVERN_BARD_NEXT' });
  assert.deepEqual(offered.tavern.bardCurrentContent, {
    type: 'riddle', id: 'map_without_houses', optionOrder: [2, 0, 1], answer: null, awarded: false,
  });
  assert.equal(offered.rngState, 3343425646);
  assert.strictEqual(gameReducer(offered, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'Not an option' } }), offered);
  const wrong = gameReducer(offered, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'A dream' } });
  assert.equal(wrong.denarii, 700);
  assert.strictEqual(gameReducer(wrong, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'A map' } }), wrong);

  const solved = gameReducer(offered, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'A map' } });
  assert.equal(solved.denarii, 710);
  assert.equal(solved.tavern.bardRiddlesSolved, 1);
  assert.deepEqual(solved.tavern.bardSolvedRiddleIds, ['map_without_houses']);
  assert.strictEqual(gameReducer(solved, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'A map' } }), solved);
  const saved = readV2Save(writeV2Save(solved));
  assert.equal(saved.ok, true);
  if (saved.ok) assert.equal(saved.state.tavern.bardCurrentContent?.type, 'riddle');

  let current = solved;
  for (let count = 0; count < 10; count++) current = gameReducer(current, { type: 'TAVERN_BARD_NEXT' });
  const currentRiddle=present(current.tavern.bardCurrentContent, 'current riddle');assert.ok(currentRiddle.type==='riddle');assert.equal(currentRiddle.id, 'map_without_houses');
  assert.equal(current.rngState, 1320036242);
  const repeated = gameReducer(current, { type: 'TAVERN_BARD_ANSWER', payload: { option: 'A map' } });
  assert.equal(repeated.denarii, 710);
  assert.equal(repeated.tavern.bardRiddlesSolved, 1);
  const repeatedRiddle=present(repeated.tavern.bardCurrentContent, 'repeated riddle');assert.ok(repeatedRiddle.type==='riddle');assert.equal(repeatedRiddle.awarded, false);
});

test('invalid saved Bard content and history are rejected while older saves remain readable', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 5 } });
  const offered = gameReducer(gameReducer(started, { type: 'TAVERN_VISIT' }), { type: 'TAVERN_BARD_NEXT' });
  const envelope = JSON.parse(writeV2Save(offered));
  const badOptions = structuredClone(envelope);
  badOptions.state.tavern.bardCurrentContent.optionOrder = [0, 0, 1];
  assert.equal(readV2Save(JSON.stringify(badOptions)).ok, false);
  for (const optionOrder of [[2, 0, 99], [-1, 0, 1], [0, 0.1, 2]]) {
    const invalidIndex = structuredClone(envelope);
    invalidIndex.state.tavern.bardCurrentContent.optionOrder = optionOrder;
    assert.equal(readV2Save(JSON.stringify(invalidIndex)).ok, false);
  }
  const badId = structuredClone(envelope);
  badId.state.tavern.bardCurrentContent.id = 'unknown';
  assert.equal(readV2Save(JSON.stringify(badId)).ok, false);
  const badSolved = structuredClone(envelope);
  badSolved.state.tavern.bardSolvedRiddleIds = ['unknown'];
  assert.equal(readV2Save(JSON.stringify(badSolved)).ok, false);
  const badBag = structuredClone(envelope);
  badBag.state.tavern.bardTalesRemaining = [0, 0];
  assert.equal(readV2Save(JSON.stringify(badBag)).ok, false);
  const older = structuredClone(envelope);
  delete older.state.tavern.bardCurrentContent;
  delete older.state.tavern.bardSolvedRiddleIds;
  delete older.state.tavern.bardTalesRemaining;
  delete older.state.tavern.bardTalesServed;
  assert.equal(readV2Save(JSON.stringify(older)).ok, true);
});
