import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const imported = readLegacySave(await readFile(new URL('../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
if (!imported.ok) throw new Error(imported.error);
const base = imported.state;
test('military commands reject non-whole quantities', () => {
  const state = { ...createInitialState(104), phase: 'management' };
  for (const type of ['RECRUIT_SOLDIERS', 'DISMISS_SOLDIERS']) {
    for (const count of [undefined, null, 0, -1, 0.5, NaN, Infinity, '1', true, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(gameReducer(state, { type, payload: { soldierType: 'levy', count } }), state, `${type}: ${String(count)}`);
    }
  }
});
test('military commands reject non-authored soldier identifiers', () => {
  const state = { ...createInitialState(104), phase: 'management' };
  for (const type of ['RECRUIT_SOLDIERS', 'DISMISS_SOLDIERS']) {
    for (const soldierType of ['dragon', 'constructor', 'toString', '__proto__', ['levy'], null, 1]) {
      assert.equal(gameReducer(state, { type, payload: { soldierType, count: 1 } }), state, `${type}: ${String(soldierType)}`);
    }
  }
});
test('military save fields reject fractional rosters and non-authored fortification levels', () => {
  const cases = [
    ...(['walls', 'gate', 'moat'] as const).flatMap(key => [-1, 0.5, 5, '1', null, undefined].map(value => ({
      label: key, state: { ...base, military: { ...base.military, [key]: value } },
    }))),
    ...(['levy', 'menAtArms', 'knights'] as const).map(key => ({ label: key,
      state: { ...base, military: { ...base.military, garrison: { ...base.military.garrison, [key]: 0.5 } } },
    })),
    { label: 'moat', state: { ...base, military: { ...base.military, moat: 4 } } },
    { label: 'garrison', state: { ...base, garrison: 5.5 } },
    ...[-1, 0.5, 5, '1'].map(castleLevel => ({ label: 'castleLevel', state: { ...base, castleLevel } })),
  ];
  for (const { label, state } of cases) {
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false, `legacy ${label}`);
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false, `v2 ${label}`);
    assert.throws(() => writeV2Save(state), /Save/, `write ${label}`);
  }
});
