import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import encounters from '../../src/data/audience.ts';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('Audience retains all twenty authored encounters and sixty-one response branches', () => {
  assert.equal(encounters.length, 20);
  assert.equal(encounters.reduce((n, encounter) => n + encounter.responses.length, 0), 61);
  assert.deepEqual(encounters.map(encounter => encounter.id), Array.from({ length: 20 }, (_, i) => `aud_${String(i + 1).padStart(3, '0')}`));
  assert.equal(createHash('sha256').update(JSON.stringify(encounters)).digest('hex'),
    'ba5cfd4bfdd25f25ea2084667c55eb0ffb72a7ac878f6494263e835535ed8d8b');
});

test('Every authored audience response retains meter changes, logs and save continuation', () => {
  for (const encounter of encounters) for (const [responseIndex, response] of encounter.responses.entries()) {
    const state = { ...createInitialState(104), phase: 'management' }, before = structuredClone(state);
    const next = gameReducer(state, { type: 'HALL_AUDIENCE_RESPOND', payload: { encounterId: encounter.id, responseIndex, consequences: response.consequences } });
    for (const key of ['people', 'treasury', 'church', 'military'] as const) {
      assert.equal(next.greatHall.meters[key], Math.max(0, Math.min(100, state.greatHall.meters[key] + response.consequences[key])));
    }
    assert.deepEqual(next.greatHall.audienceResolved, [encounter.id]);
    assert.deepEqual(next.greatHall.hallLog.at(-1).consequences, response.consequences);
    assert.equal(next.greatHall.stewardTrust, Math.min(100, (state.greatHall.stewardTrust ?? 50) + 1));
    assert.equal(next.chronicle.length, state.chronicle.length + 1);
    assert.equal(next.rngState, state.rngState); assert.deepEqual(state, before);
    const loaded = readV2Save(writeV2Save(next)); assert.ok(loaded.ok);
    assert.deepEqual(loaded.state.greatHall, next.greatHall);
  }
});
