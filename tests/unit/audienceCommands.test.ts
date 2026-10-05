import assert from 'node:assert/strict';
import test from 'node:test';
import encounters from '../../src/data/audience.ts';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
const authored = encounters[0]?.responses[0]?.consequences;
if (!authored) throw new Error('Missing first authored response');
const action = { type: 'HALL_AUDIENCE_RESPOND', payload: { encounterId: 'aud_001', responseIndex: 0, consequences: authored } };

test('Invalid audience identities, indices, payloads and phases are exact no-ops', () => {
  const base = { ...createInitialState(104), phase: 'management' };
  const invalid: unknown[] = [undefined, null, [], {}, 'response', { encounterId: 'unknown', responseIndex: 0 },
    { encounterId: 'aud_001' }, ...[-1, 3, 999, 0.5, NaN, Infinity, '0', null].map(responseIndex => ({ encounterId: 'aud_001', responseIndex, consequences: authored }))];
  for (const payload of invalid) assert.equal(gameReducer(base, { type: 'HALL_AUDIENCE_RESPOND', payload }), base);
  for (const phase of ['title', 'seasonal_action', 'seasonal_resolve', 'random_event', 'raid_warning', 'flip_decision', 'victory', 'game_over']) {
    const state = { ...base, phase }; assert.equal(gameReducer(state, action), state);
  }
});

test('Audience effects come from the selected authored response rather than caller effects', () => {
  const state = { ...createInitialState(104), phase: 'management' };
  const expected = gameReducer(state, action);
  for (const consequences of [{ people: 100, treasury: 100, church: 100, military: 100 }, null, 'fake', { people: NaN }, undefined]) {
    assert.deepEqual(gameReducer(state, { ...action, payload: { ...action.payload, consequences } }), expected);
  }
  assert.deepEqual(gameReducer(state, { type: 'HALL_AUDIENCE_RESPOND', payload: { encounterId: 'aud_001', responseIndex: 0 } }), expected);
});

test('Audience rewards and logs apply once across Save/Load and tab changes', () => {
  const state = { ...createInitialState(104), phase: 'management' }, next = gameReducer(state, action);
  assert.equal(gameReducer(next, action), next);
  const parsed = readV2Save(writeV2Save(next)); assert.ok(parsed.ok);
  const reloaded = { ...parsed.state, activeTab: 'hall' };
  assert.equal(gameReducer(reloaded, action), reloaded);
});

test('Audience engagement preserves zero steward trust and adds one', () => {
  const initial = createInitialState(104);
  const state = { ...initial, phase: 'management', greatHall: { ...initial.greatHall, stewardTrust: 0 } };
  assert.ok(readV2Save(writeV2Save(state)).ok);
  const next = gameReducer(state, action);
  assert.equal(next.greatHall.stewardTrust, 1); assert.equal(state.greatHall.stewardTrust, 0);
});
