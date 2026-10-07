import assert from 'node:assert/strict';
import test from 'node:test';
import { FEAST_DATA, type HallMeterEffects } from '../../src/data/decrees.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { hasFeastedInSeason, isFeastHistory, resolveFeast, validateHallFeastState } from '../../src/engine/feast.ts';
const state = { ...createInitialState(104), phase: 'management' as const };
const selection = { guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', seed: state.rngState };
function history() { return { season: 'spring' as const, year: 1, totalEffects: resolveFeast(selection, state.rngState)?.totalEffects,
  guestId: 'village', entertainmentId: 'musicians', courseId: 'modest', eventId: resolveFeast(selection, state.rngState)?.event.id }; }
test('Feast command consumes serialized identities rather than inherited or hidden fields', () => {
  assert.equal(resolveFeast(Object.create(selection), state.rngState), null);
  for (const key of Object.keys(selection)) {
    const hidden = { ...selection }; Object.defineProperty(hidden, key, { enumerable: false });
    assert.equal(resolveFeast(hidden, state.rngState), null, key);
  }
});
test('Feast canonical outcome does not retain arbitrary caller payload or aliases', () => {
  const input = { ...selection, arbitrary: { people: 999 } }, before = structuredClone(input);
  const outcome = resolveFeast(input, state.rngState); assert.ok(outcome);
  assert.notStrictEqual(outcome.selection, input); assert.deepEqual(outcome.selection, selection); assert.deepEqual(input, before);
  input.guestId = 'clergy'; assert.equal(outcome.selection.guestId, 'village');
});
test('Feast history dates and identities must survive serialization', () => {
  const entry = history(); assert.equal(isFeastHistory([entry]), true);
  assert.equal(isFeastHistory([Object.create(entry)]), false);
  for (const key of Object.keys(entry)) {
    const hidden = { ...entry }; Object.defineProperty(hidden, key, { enumerable: false });
    assert.equal(isFeastHistory([hidden]), false, key);
  }
});
test('Feast history meter values must be own serialized fields', () => {
  const entry = history(); assert.ok(entry.totalEffects);
  assert.equal(isFeastHistory([{ ...entry, totalEffects: Object.create(entry.totalEffects) }]), false);
  for (const key of Object.keys(entry.totalEffects)) {
    const hidden: HallMeterEffects = { ...entry.totalEffects }; Object.defineProperty(hidden, key, { enumerable: false });
    assert.equal(isFeastHistory([{ ...entry, totalEffects: hidden }]), false, key);
  }
});

test('current history gates a missing flag without modifying compatible save bytes', () => {
  const completed = gameReducer(state, { type: 'HALL_FEAST_COMPLETE', payload: selection });
  const settled = {...completed, greatHall: {...completed.greatHall}};
  delete settled.greatHall.hasFeastedThisSeason;
  const raw = writeV2Save(settled), loaded = readV2Save(raw);
  assert.ok(loaded.ok);
  assert.equal(hasFeastedInSeason(loaded.state.greatHall, 'spring', 1), true);
  assert.equal(hasFeastedInSeason(loaded.state.greatHall, 'summer', 1), false);
  assert.equal(hasFeastedInSeason({}, 'spring', 1), false);
  assert.equal(hasFeastedInSeason({ hasFeastedThisSeason: true }, 'summer', 1), true);
  assert.equal(writeV2Save(loaded.state), raw);
  const legacy = readLegacySave(JSON.stringify(settled)); assert.ok(legacy.ok);
  assert.equal(writeV2Save(legacy.state), raw);
  assert.strictEqual(gameReducer(loaded.state, { type: 'HALL_FEAST_COMPLETE', payload: { ...selection, seed: loaded.state.rngState } }), loaded.state);
});
test('all authored Feast totals validate detailed and effect-only legacy history', () => {
  for (const guest of FEAST_DATA.guestOptions) for (const entertainment of FEAST_DATA.entertainmentOptions)
    for (const course of FEAST_DATA.courseOptions) for (const event of FEAST_DATA.randomEvents) {
      const totalEffects = { people: 0, treasury: 0, church: 0, military: 0 };
      for (const effects of [guest.effects, entertainment.effects, course.effects, event.effects]) {
        for (const key of ['people', 'treasury', 'church', 'military'] as const) totalEffects[key] += effects[key];
      }
      const legacy = { season: 'spring' as const, year: 1, totalEffects };
      const detailed = { ...legacy, guestId: guest.id, entertainmentId: entertainment.id, courseId: course.id, eventId: event.id };
      assert.equal(isFeastHistory([legacy]), true); assert.equal(isFeastHistory([detailed]), true);
      assert.equal(isFeastHistory([{ ...legacy, guestId: guest.id }]), false);
    }
});
test('Feast save defaults and serialized optional ownership retain the existing rules', () => {
  assert.equal(validateHallFeastState({}, 'spring', 1), null);
  for (const key of ['hasFeastedThisSeason', 'feastHistory']) {
    assert.notEqual(validateHallFeastState({ [key]: null }, 'spring', 1), null);
    const prototype = Object.create({ [key]: key === 'feastHistory' ? [] : false });
    assert.notEqual(validateHallFeastState(prototype, 'spring', 1), null);
    const hidden = { [key]: key === 'feastHistory' ? [] : false }; Object.defineProperty(hidden, key, { enumerable: false });
    assert.notEqual(validateHallFeastState(hidden, 'spring', 1), null);
  }
  assert.notEqual(validateHallFeastState({ hasFeastedThisSeason: false, feastHistory: [history()] }, 'spring', 1), null);
  assert.equal(validateHallFeastState({ feastHistory: [history()] }, 'spring', 1), null);
  assert.equal(validateHallFeastState({ hasFeastedThisSeason: false, feastHistory: [history()] }, 'summer', 1), null);
});
