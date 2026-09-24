import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { previewFeastEvent, resolveFeast } from '../../src/engine/feast.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('a caller cannot submit arbitrary feast effects without a plan', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const forged = gameReducer(started, {
    type: 'HALL_FEAST_COMPLETE',
    payload: { totalEffects: { people: 1_000_000, treasury: 1_000_000, church: 1_000_000, military: 1_000_000 } },
  });
  assert.strictEqual(forged, started);
});

test('a saved feast seed and three authored choices produce one canonical event and effect', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const before = structuredClone(started);
  const selection = {
    guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', seed: started.rngState,
  };
  assert.equal(started.rngState, 2775531185);
  assert.equal(previewFeastEvent(selection.seed)?.event.id, 'proposal');
  assert.deepEqual(resolveFeast(selection, started.rngState)?.totalEffects,
    { people: 9, treasury: -4, church: 1, military: 0 });
  const settled = gameReducer(started, { type: 'HALL_FEAST_COMPLETE', payload: selection });
  assert.deepEqual(started, before);
  assert.equal(settled.rngState, 312129702);
  assert.deepEqual(settled.greatHall.meters,
    { people: 59, treasury: 46, church: 51, military: 50 });
  assert.equal(settled.greatHall.stewardTrust, 53);
  assert.deepEqual(settled.greatHall.feastHistory[0], {
    season: 'spring', year: 1,
    totalEffects: { people: 9, treasury: -4, church: 1, military: 0 },
    guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', eventId: 'proposal',
  });
  assert.equal(readV2Save(writeV2Save(settled)).ok, true);
  assert.strictEqual(gameReducer(settled, { type: 'HALL_FEAST_COMPLETE', payload: selection }), settled);
  const unsetFlag = { ...settled, greatHall: { ...settled.greatHall, hasFeastedThisSeason: false } };
  assert.strictEqual(gameReducer(unsetFlag, { type: 'HALL_FEAST_COMPLETE', payload: {
    ...selection, seed: unsetFlag.rngState,
  } }), unsetFlag);
});

test('invalid feast selections and stale draws cannot spend the saved random cursor', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const valid = {
    guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', seed: started.rngState,
  };
  for (const invalid of [
    { ...valid, guestId: 'imagined_nobles' },
    { ...valid, entertainmentId: 'imagined_jesters' },
    { ...valid, courseId: 'imagined_feast' },
    { ...valid, seed: 0 },
    { ...valid, seed: -1 },
    { ...valid, seed: Number.NaN },
    { guestId: valid.guestId, seed: valid.seed },
    null,
  ]) {
    assert.strictEqual(gameReducer(started, { type: 'HALL_FEAST_COMPLETE', payload: invalid }), started);
  }
  const blockedPhase = { ...started, phase: 'seasonal_action' };
  assert.strictEqual(gameReducer(blockedPhase, { type: 'HALL_FEAST_COMPLETE', payload: valid }), blockedPhase);
});

test('a feast save rejects forged history while accepting older effect-only entries', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const settled = gameReducer(started, { type: 'HALL_FEAST_COMPLETE', payload: {
    guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', seed: started.rngState,
  } });
  const envelope = JSON.parse(writeV2Save(settled));
  for (const damage of ['flag', 'event', 'effect', 'repeat-flag', 'duplicate']) {
    const corrupted = structuredClone(envelope);
    if (damage === 'flag') corrupted.state.greatHall.hasFeastedThisSeason = 'yes';
    if (damage === 'event') corrupted.state.greatHall.feastHistory[0].eventId = 'invented_event';
    if (damage === 'effect') corrupted.state.greatHall.feastHistory[0].totalEffects.people = 1_000_000;
    if (damage === 'repeat-flag') corrupted.state.greatHall.hasFeastedThisSeason = false;
    if (damage === 'duplicate') {
      corrupted.state.greatHall.feastHistory.push(structuredClone(corrupted.state.greatHall.feastHistory[0]));
    }
    assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false, damage);
  }
  const older = structuredClone(envelope);
  for (const key of ['guestId', 'entertainmentId', 'courseId', 'eventId']) {
    delete older.state.greatHall.feastHistory[0][key];
  }
  assert.equal(readV2Save(JSON.stringify(older)).ok, true);
});

test('a validator-accepted older save without feast history can settle a feast', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const older = structuredClone(started);
  delete older.greatHall.feastHistory;
  delete older.greatHall.hasFeastedThisSeason;
  const imported = readLegacySave(JSON.stringify(older));
  if (!imported.ok) assert.fail(imported.error);
  const reloaded = readV2Save(writeV2Save(imported.state));
  if (!reloaded.ok) assert.fail(reloaded.error);
  const settled = gameReducer(reloaded.state, {
    type: 'HALL_FEAST_COMPLETE', payload: {
      guestId: 'village', entertainmentId: 'musicians', courseId: 'modest',
      seed: reloaded.state.rngState,
    },
  });
  assert.equal(settled.greatHall.hasFeastedThisSeason, true);
  assert.equal(settled.greatHall.feastHistory.length, 1);
  assert.equal(readV2Save(writeV2Save(settled)).ok, true);
});
