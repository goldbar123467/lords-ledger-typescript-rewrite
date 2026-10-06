import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import disputes from '../../src/data/disputes.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
const fixture = () => ({ ...createInitialState(104), phase: 'management' });
const ruling = { disputeId: 'dispute_001', rulingId: 'a', consequences: { people: 0.5 }, decree: 'Older decree.', turn: 1, season: 'spring', year: 1 };
function rejected(patch: Record<string, unknown>) {
  const base = fixture(), state = { ...base, greatHall: { ...base.greatHall, ...patch } }, before = structuredClone(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false, JSON.stringify(patch));
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
  assert.throws(() => writeV2Save(state), /Great Hall/); assert.deepEqual(state, before);
}
test('dispute saves reject malformed history, identities and consumed effects', () => {
  for (const rulingHistory of [{}, 'history', [null], [{}], [{ ...ruling, disputeId: 'fake' }],
    [{ ...ruling, rulingId: 'd' }], [{ ...ruling, consequences: [] }],
    [{ ...ruling, consequences: { people: '3' } }], [{ ...ruling, consequences: { fake: 3 } }],
    [{ ...ruling, decree: {} }], [{ ...ruling, turn: -1 }], [{ ...ruling, year: 0 }],
    [{ ...ruling, season: 'fake' }]]) rejected({ rulingHistory });
  for (const disputesResolved of [-1, 0.5, '1', {}, Number.MAX_SAFE_INTEGER + 1]) rejected({ disputesResolved });
});
test('dispute writer rejects nonfinite, sparse and nonserialized history fields', () => {
  const base = fixture();
  for (const patch of [{ rulingHistory: new Array(1) }, { rulingHistory: [Object.create(ruling)] },
    { rulingHistory: [Object.defineProperty({ ...ruling }, 'decree', { value: ruling.decree, enumerable: false })] },
    { rulingHistory: [{ ...ruling, consequences: { people: Infinity } }] }, { disputesResolved: NaN }]) {
    assert.throws(() => writeV2Save({ ...base, greatHall: { ...base.greatHall, ...patch } }), /Great Hall/);
  }
  for (const key of ['rulingHistory', 'disputesResolved'] as const) assert.throws(() => writeV2Save({ ...base,
    greatHall: Object.defineProperty({ ...base.greatHall }, key, { value: base.greatHall[key], enumerable: false }) }), /Great Hall/);
});
test('compatible history preserves duplicate rulings, old prose, partial effects and independent count', () => {
  const base = fixture();
  for (const patch of [{}, { rulingHistory: null, disputesResolved: null },
    { rulingHistory: [ruling, ruling, { ...ruling, consequences: null }], disputesResolved: 9 }]) {
    const hall: Record<string, unknown> = { ...base.greatHall, ...patch };
    if (Object.keys(patch).length === 0) { delete hall.rulingHistory; delete hall.disputesResolved; }
    const state = { ...base, greatHall: hall }, before = structuredClone(state), raw = writeV2Save(state);
    const v2 = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
    assert.ok(v2.ok); assert.ok(legacy.ok); assert.deepEqual(v2.state, state); assert.deepEqual(legacy.state, state);
    assert.equal(writeV2Save(v2.state), raw); assert.deepEqual(state, before);
  }
});
test('every authored ruling identity pair and production queue history round-trips', () => {
  const base = fixture();
  for (const dispute of disputes) for (const choice of dispute.rulings) {
    const history = { ...ruling, disputeId: dispute.id, rulingId: choice.id, consequences: choice.consequences, decree: choice.decree };
    assert.ok(readV2Save(writeV2Save({ ...base, greatHall: { ...base.greatHall, rulingHistory: [history] } })).ok);
  }
  const resolved = gameReducer(base, { type: 'HALL_RULE_DISPUTE', payload: { disputeId: 'dispute_001', rulingId: 'a' } });
  const loaded = readV2Save(writeV2Save(resolved)); assert.ok(loaded.ok); assert.deepEqual(loaded.state, resolved);
});
