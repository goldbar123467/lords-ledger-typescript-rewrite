import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const fixture = () => ({ ...createInitialState(104), phase: 'management' });
const envelope = (state: unknown) => JSON.stringify({ format: 'lords-ledger', version: 2, state });
function rejected(patch: Record<string, unknown>) {
  const base = fixture(), state = { ...base, greatHall: { ...base.greatHall, ...patch } };
  const before = structuredClone(state);
  assert.equal(readV2Save(envelope(state)).ok, false, JSON.stringify(patch));
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
  assert.throws(() => writeV2Save(state), /Great Hall/);
  assert.deepEqual(state, before);
}

test('audience save rejects malformed identities and trust on both readers and writer', () => {
  for (const audienceResolved of [{}, 'aud_001', [null], [42], ['fake'], ['aud_999']]) rejected({ audienceResolved });
  for (const stewardTrust of [-1, 101, '50', {}, false]) rejected({ stewardTrust });
  for (const stewardTrust of [NaN, Infinity, -Infinity]) {
    const base = fixture();
    assert.throws(() => writeV2Save({ ...base, greatHall: { ...base.greatHall, stewardTrust } }), /Great Hall/);
  }
});

test('shared Hall logs reject malformed containers and consumed entry fields', () => {
  const log = { type: 'audience', text: 'Older petitioner wording.', turn: 1, season: 'spring', year: 1, consequences: { people: 3 } };
  for (const hallLog of [{}, 'history', [null], [{}], [{ ...log, type: 'fake' }], [{ ...log, text: {} }],
    [{ ...log, season: 'fake' }], [{ ...log, turn: -1 }], [{ ...log, year: 0 }],
    [{ ...log, consequences: [] }], [{ ...log, consequences: { people: '3' } }],
    [{ ...log, consequences: { fake: 1 } }]]) rejected({ hallLog });
});

test('Hall compatibility preserves nullish defaults, duplicate known identities, fractional trust and old logs', () => {
  const base = fixture();
  const patches = [{}, { audienceResolved: null, stewardTrust: null, hallLog: null },
    { audienceResolved: ['aud_001', 'aud_001'], stewardTrust: 0.5,
      hallLog: [{ type: 'audience', text: 'Older petitioner wording.', turn: 1, season: 'spring', year: 1, consequences: { people: 3 } },
        { type: 'decree_revoke', text: 'Older decree wording.', turn: 1, season: 'spring', year: 1 }] }];
  for (const patch of patches) {
    const hall: Record<string, unknown> = { ...base.greatHall, ...patch };
    if (Object.keys(patch).length === 0) { delete hall.audienceResolved; delete hall.stewardTrust; delete hall.hallLog; }
    const state = { ...base, greatHall: hall }, before = structuredClone(state), raw = writeV2Save(state);
    const v2 = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
    assert.ok(v2.ok); assert.ok(legacy.ok);
    assert.deepEqual(v2.state, state); assert.deepEqual(legacy.state, state);
    assert.equal(writeV2Save(v2.state), raw); assert.deepEqual(state, before);
  }
  const logs = ['dispute', 'audience', 'decree', 'decree_revoke', 'council', 'feast', 'crisis', 'peak']
    .map(type => ({ type, text: 'Older Hall wording.', turn: 1, season: 'spring', year: 1, consequences: null }));
  assert.ok(readV2Save(writeV2Save({ ...base, greatHall: { ...base.greatHall, hallLog: logs } })).ok);
  const resolved = gameReducer(base, { type: 'HALL_AUDIENCE_RESPOND', payload: { encounterId: 'aud_001', responseIndex: 0 } });
  assert.ok(readV2Save(writeV2Save(resolved)).ok);
});

test('Hall writer rejects sparse and inherited records that would serialize to malformed logs', () => {
  const base = fixture();
  const log = { type: 'audience', text: 'Old wording.', turn: 1, season: 'spring', year: 1 };
  for (const patch of [{ audienceResolved: new Array(1) }, { hallLog: new Array(1) }, { hallLog: [Object.create(log)] },
    { hallLog: [Object.defineProperty({ ...log }, 'text', { value: log.text, enumerable: false })] },
    { meters: Object.defineProperty({ ...base.greatHall.meters }, 'people', { value: 50, enumerable: false }) }]) {
    assert.throws(() => writeV2Save({ ...base, greatHall: { ...base.greatHall, ...patch } }), /Great Hall/);
  }
  assert.throws(() => writeV2Save({ ...base, greatHall: Object.create(base.greatHall) }), /Great Hall/);
  assert.throws(() => writeV2Save({ ...base, greatHall: Object.defineProperty({ ...base.greatHall }, 'stewardTrust', { value: 0, enumerable: false }) }), /Great Hall/);
});
