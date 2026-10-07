import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const fixture = () => ({ ...createInitialState(104), phase: 'management' as const });
const envelope = (state: unknown) => JSON.stringify({ format: 'lords-ledger', version: 2, state });

test('People save boundary rejects malformed labor and tier shapes on both readers and writer', () => {
  const base = fixture();
  for (const patch of [{ laborFarming: '70' }, { laborFarming: 101 }, { laborGarrison: -1 }, { laborGarrison: 41 },
    { laborChurch: 16 }, { tiers: {} }, { tiers: [] }, { tiers: { serfs: -1, freemen: 6, skilled: 3 } },
    { tiers: { serfs: 11, freemen: 6.5, skilled: 3 } }, { tiers: { serfs: 11, freemen: 6, skilled: '3' } }]) {
    const state = { ...base, people: { ...base.people, ...patch } };
    const before = structuredClone(state);
    assert.equal(readV2Save(envelope(state)).ok, false, JSON.stringify(patch));
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state), /People/);
    assert.deepEqual(state, before);
  }
});

test('People validates authored family identities, rule fields, loyalty and complete nested data', () => {
  const base = fixture(), first = base.people.notableFamilies[0];
  assert.ok(first);
  for (const notableFamilies of [{}, [null], [{ id: 'tanner' }], [first, first],
    [{ ...first, id: 'fake' }], [{ ...first, roleIcon: 'fake' }], [{ ...first, tier: 'skilled' }],
    [{ ...first, loyalty: 5 }], [{ ...first, loyalty: -1 }], [{ ...first, turnsGone: 0.5 }],
    [{ ...first, present: 'yes' }], [{ ...first, generations: -1 }], [{ ...first, narrative: {} }],
    [{ ...first, maxLoyalty: 100 }], [{ ...first, bonus: { ...first.bonus, amount: 100 } }]]) {
    const state = { ...base, people: { ...base.people, notableFamilies } };
    assert.equal(readV2Save(envelope(state)).ok, false);
    assert.throws(() => writeV2Save(state), /People/);
  }
});

test('People validates village events and tax history without silently deleting damaged data', () => {
  const base = fixture();
  for (const patch of [{ villageFeed: {} }, { villageFeed: [null] }, { villageFeed: [{ text: {}, type: 'life' }] },
    { villageFeed: [{ text: 'x', type: 'fake' }] }, { taxHistory: {} }, { taxHistory: [null] },
    { taxHistory: [{ season: 'fake' as const, year: 1, revenue: 0 }] }, { taxHistory: [{ season: 'spring' as const, year: 0, revenue: 0 }] },
    { taxHistory: [{ season: 'spring' as const, year: 1, revenue: -1 }] }]) {
    const state = { ...base, people: { ...base.people, ...patch } };
    assert.equal(readV2Save(envelope(state)).ok, false);
    assert.throws(() => writeV2Save(state), /People/);
  }
});

test('People earlier missing/null defaults, legal fractions and older story text round-trip exactly', () => {
  const base = fixture();
  const older = base.people.notableFamilies.map(f => ({ ...f, narrative: 'An older authored family story.' }));
  for (const people of [{}, Object.fromEntries(Object.keys(base.people).map(key => [key, null])), base.people,
    { ...base.people, laborFarming: 12.5, laborGarrison: 7.5, laborChurch: 2.5, notableFamilies: older,
      villageFeed: [{ text: 'Older village prose.', type: 'life' }], taxHistory: [{ season: 'autumn' as const, year: 1, revenue: 12.5 }] }]) {
    const state = { ...base, people }, before = structuredClone(state);
    const raw = writeV2Save(state), v2 = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
    assert.ok(v2.ok); assert.ok(legacy.ok);
    assert.deepEqual(v2.state, state); assert.deepEqual(legacy.state, state);
    assert.equal(writeV2Save(v2.state), raw); assert.deepEqual(state, before);
  }
});
