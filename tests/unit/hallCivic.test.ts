import type {GameSnapshot} from '../../src/save/saveGame.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { DECREE_OPTIONS, COUNCIL_TOPICS, FEAST_DATA } from '../../src/data/decrees.ts';
import { readV2Save, readLegacySave, writeV2Save } from '../../src/save/saveGame.ts';
const fixture = () => ({ ...createInitialState(104), phase: 'management' as const, turn: 4, season: 'winter' as const });
const decree = DECREE_OPTIONS[0], topic = COUNCIL_TOPICS[0], option = topic?.options[0];
if (!decree || !topic || !option) throw new Error('Missing authored civic fixtures');
test('civic commands reject wrong phases and malformed payloads atomically', () => {
  for (const phase of ['title', 'random_event', 'seasonal_resolve', 'victory', 'game_over']) {
    const base = fixture(), state = { ...base, phase, greatHall: { ...base.greatHall, activeDecrees: [decree.id] } };
    for (const action of [{ type: 'HALL_ISSUE_DECREE', payload: { decreeId: DECREE_OPTIONS[1]?.id, effects: decree.effects } },
      { type: 'HALL_REVOKE_DECREE', payload: { decreeId: decree.id } },
      { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id, consequences: option.consequences } }]) assert.equal(gameReducer(state, action), state);
  }
  const state = fixture();
  for (const type of ['HALL_ISSUE_DECREE', 'HALL_REVOKE_DECREE', 'HALL_COUNCIL_VOTE']) for (const payload of [null, [], {}, false, 'fake']) assert.equal(gameReducer(state, { type, payload }), state);
});
test('Council uses authored first-unresolved choices, unlock boundaries and prevents repeats', () => {
  const base = fixture(), before = structuredClone(base);
  const result = gameReducer(base, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id, consequences: { people: 99, treasury: 99 } } });
  const expected = { people: 50, treasury: 55, church: 46, military: 53 };
  assert.deepEqual(result.greatHall.meters, expected); assert.deepEqual(base, before); assert.equal(result.rngState, base.rngState);
  assert.equal(gameReducer(result, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } }), result);
  for (const payload of [{ topicId: 'fake', optionId: option.id }, { topicId: topic.id, optionId: 'fake' },
    { topicId: COUNCIL_TOPICS[1]?.id, optionId: COUNCIL_TOPICS[1]?.options[0]?.id }]) assert.equal(gameReducer(base, { type: 'HALL_COUNCIL_VOTE', payload }), base);
  for (const people of [0, 70, 70.5, 100]) {
    const state = { ...base, turn: 1, season: 'spring' as const, greatHall: { ...base.greatHall, meters: { ...base.greatHall.meters, people } } };
    assert.equal(gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } }) === state, people <= 70);
  }
  let state: GameSnapshot = base;
  for (const current of COUNCIL_TOPICS) state = gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: current.id, optionId: current.options[0]?.id } });
  assert.deepEqual(state.greatHall.councilResolved, COUNCIL_TOPICS.map(t => t.id));
});
test('decree issue uses authored effects, counts issues and does not refund revocations', () => {
  const base = fixture(), before = structuredClone(base);
  const issued = gameReducer(base, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id, effects: { people: 99 } } });
  assert.equal(issued.greatHall.meters.people, base.greatHall.meters.people + decree.effects.people);
  assert.equal(issued.greatHall.decreeSlotsUsed, 1); assert.deepEqual(base, before); assert.equal(issued.rngState, base.rngState);
  assert.equal(gameReducer(issued, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } }), issued);
  const revoked = gameReducer(issued, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: decree.id } });
  assert.deepEqual(revoked.greatHall.activeDecrees, []); assert.equal(revoked.greatHall.decreeSlotsUsed, 1); assert.deepEqual(revoked.greatHall.meters, issued.greatHall.meters);
  assert.equal(gameReducer(revoked, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: decree.id } }), revoked);
  const second = gameReducer(revoked, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } });
  assert.equal(second.greatHall.decreeSlotsUsed, 2);
  assert.equal(gameReducer(second, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: DECREE_OPTIONS[1]?.id } }), second);
  for (const fixed of DECREE_OPTIONS.filter(d => !d.revokable)) {
    const state = { ...base, greatHall: { ...base.greatHall, activeDecrees: [fixed.id] } };
    assert.equal(gameReducer(state, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: fixed.id } }), state);
  }
});
test('missing/null civic defaults act safely while historical excessive counts remain capped', () => {
  const base = fixture();
  for (const value of [null, undefined]) {
    const state = { ...base, greatHall: { ...base.greatHall, activeDecrees: value, councilResolved: value, decreeSlotsUsed: value, stewardTrust: 0 } };
    const issued = gameReducer(state, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } }); assert.equal(issued.greatHall.decreeSlotsUsed, 1);
    const voted = gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } }); assert.equal(voted.greatHall.stewardTrust, 1);
  }
  const excess = { ...base, greatHall: { ...base.greatHall, decreeSlotsUsed: 9 } };
  assert.equal(gameReducer(excess, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } }), excess);
});
function rejected(patch: Record<string, unknown>) {
  const base = fixture(), state = { ...base, greatHall: { ...base.greatHall, ...patch } }, before = structuredClone(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false, JSON.stringify(patch));
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false); assert.throws(() => writeV2Save(state), /Great Hall/); assert.deepEqual(state, before);
}
test('civic saved identities and counters reject damaged shapes in both readers and writer', () => {
  for (const field of ['activeDecrees', 'councilResolved']) for (const value of [{}, 'fake', [null], [4], ['fake']]) rejected({ [field]: value });
  for (const value of [-1, 0.5, '1', false, {}, Number.MAX_SAFE_INTEGER + 1]) rejected({ decreeSlotsUsed: value });
});
test('civic writer rejects sparse/nonserialized/nonfinite fields', () => {
  const base = fixture();
  for (const patch of [{ activeDecrees: new Array(1) }, { councilResolved: new Array(1) }, { decreeSlotsUsed: NaN }, { decreeSlotsUsed: Infinity }]) assert.throws(() => writeV2Save({ ...base, greatHall: { ...base.greatHall, ...patch } }), /Great Hall/);
  for (const key of ['activeDecrees', 'councilResolved', 'decreeSlotsUsed'] as const) assert.throws(() => writeV2Save({ ...base, greatHall: Object.defineProperty({ ...base.greatHall }, key, { value: base.greatHall[key], enumerable: false }) }), /Great Hall/);
});
test('civic saves preserve missing/null fields, known duplicates and independent counts above two', () => {
  const base = fixture();
  for (const patch of [{}, { activeDecrees: null, councilResolved: null, decreeSlotsUsed: null },
    { activeDecrees: [decree.id, decree.id], councilResolved: [topic.id, topic.id], decreeSlotsUsed: 9 }]) {
    const hall: Record<string, unknown> = { ...base.greatHall, ...patch };
    if (Object.keys(patch).length === 0) { delete hall.activeDecrees; delete hall.councilResolved; delete hall.decreeSlotsUsed; }
    const state = { ...base, greatHall: hall }, raw = writeV2Save(state), v2 = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
    assert.ok(v2.ok); assert.ok(legacy.ok); assert.deepEqual(v2.state, state); assert.deepEqual(legacy.state, state); assert.equal(writeV2Save(v2.state), raw);
  }
});
test('complete civic/Feast authored definitions preserve recorded inventory and bytes', () => {
  assert.equal(DECREE_OPTIONS.length, 10); assert.equal(DECREE_OPTIONS.filter(d => d.revokable).length, 7);
  assert.equal(COUNCIL_TOPICS.length, 4); assert.equal(COUNCIL_TOPICS.reduce((n,t) => n + t.options.length, 0), 12);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify({ DECREE_OPTIONS, COUNCIL_TOPICS, FEAST_DATA })).digest('hex'), 'abca9604ac9ec1e419866991d29f4b3accea36dd72a84d7c5a1b15e8c685c732');
});

test('saved replay guards and seasonal reset preserve active decree rules', () => {
  const base = fixture(), issued = gameReducer(base, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } });
  const loadedIssue = readV2Save(writeV2Save(issued)); assert.ok(loadedIssue.ok);
  assert.equal(gameReducer(loadedIssue.state, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id, effects: decree.effects } }), loadedIssue.state);
  const voted = gameReducer(base, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } });
  const loadedVote = readV2Save(writeV2Save(voted)); assert.ok(loadedVote.ok);
  assert.equal(gameReducer(loadedVote.state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id, consequences: option.consequences } }), loadedVote.state);
  const next = gameReducer({ ...issued, phase: 'random_resolve' as const }, { type: 'ADVANCE_TURN' });
  assert.equal(next.greatHall.decreeSlotsUsed, 0); assert.deepEqual(next.greatHall.activeDecrees, [decree.id]);
  const fresh = gameReducer({ ...next, phase: 'management' as const }, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: DECREE_OPTIONS[1]?.id } });
  assert.equal(fresh.greatHall.decreeSlotsUsed, 1);
});
