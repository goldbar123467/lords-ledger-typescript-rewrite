import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const fixture = () => ({ ...createInitialState(104), phase: 'management' });

test('writer rejects inherited family records that JSON drops into unreadable objects', () => {
  const base = fixture(), first = base.people.notableFamilies[0];
  assert.ok(first);
  const family: object = Object.create(first);
  const state = { ...base, people: { ...base.people, notableFamilies: [family] } };
  assert.throws(() => writeV2Save(state), /People/);
  assert.equal(state.people.notableFamilies[0], family);
  assert.equal(Object.getPrototypeOf(family), first);
});

test('writer rejects Hall effects whose JSON serialization changes their validated shape', () => {
  const base = fixture(), effects = new Date('2020-01-01T00:00:00Z');
  const state = { ...base, greatHall: { ...base.greatHall, hallLog: [
    { type: 'audience', text: 'Old wording.', turn: 1, season: 'spring', year: 1, consequences: effects },
  ] } };
  assert.throws(() => writeV2Save(state), /Great Hall/);
  assert.equal(state.greatHall.hallLog[0]?.consequences, effects);
  assert.equal(effects.toISOString(), '2020-01-01T00:00:00.000Z');
});

test('writer rejects custom snapshot serializers that remove required state', () => {
  const base = fixture();
  const state = { ...base, toJSON() { return { ...base, greatHall: {} }; } };
  assert.throws(() => writeV2Save(state), /Great Hall/);
  assert.equal(state.greatHall, base.greatHall);
});

test('ordinary serialized saves keep their original bytes, input state and saved RNG', () => {
  for (const seed of [1, 104, 65535]) {
    const state = { ...createInitialState(seed), phase: 'management' }, before = structuredClone(state);
    const expected = JSON.stringify({ format: 'lords-ledger', version: 2, state });
    const raw = writeV2Save(state), loaded = readV2Save(raw);
    assert.equal(raw, expected); assert.ok(loaded.ok); assert.deepEqual(loaded.state, state);
    assert.equal(writeV2Save(loaded.state), raw); assert.deepEqual(state, before);
  }
});
