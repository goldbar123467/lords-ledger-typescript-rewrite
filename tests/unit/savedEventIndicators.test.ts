import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import seasonal from '../../src/data/seasonalEvents.ts';
import random from '../../src/data/randomEvents.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { translateIndicators } from '../../src/engine/meterUtils.ts';

const keys = ['treasury', 'people', 'military', 'faith', 'denarii', 'food', 'population', 'garrison'];
const base = createInitialState(104);
for (const kind of ['seasonal', 'random'] as const) for (const key of keys) {
  test(`${kind} unsupported consumed indicator ${key} rejects at all save boundaries`, () => {
    const authored = kind === 'seasonal' ? seasonal.spring[0] : random[0];
    if (!authored) throw new Error('Missing authored fixture.');
    const event = { ...authored, options: authored.options.map(option => ({ ...option, indicators: { ...option.indicators, [key]: 'north' } })) };
    const state = { ...base, phase: kind === 'seasonal' ? 'seasonal_action' : 'random_event',
      currentEvent: kind === 'seasonal' ? event : null, currentRandomEvent: kind === 'random' ? event : null };
    const before = JSON.stringify(state);
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state), /Save .*indicator/);
    assert.equal(JSON.stringify(state), before);
  });
}

test('historical empty indicators and omitted notes preserve bytes and legal settlement', () => {
  const authored = seasonal.spring[0];
  const event = { ...authored, scribesNote: undefined,
    options: authored.options.map(option => ({ ...option, indicators: { ...option.indicators, treasury: '', historicalIndicator: 'north' } })) };
  const state = { ...base, phase: 'seasonal_action' as const, currentEvent: event }, raw = writeV2Save(state);
  const loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
  if (!loaded.ok) throw new Error(loaded.error);
  if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(JSON.stringify(loaded.state), JSON.stringify(state));
  assert.equal(JSON.stringify(legacy.state), JSON.stringify(state));
  assert.equal(writeV2Save(loaded.state), raw);
  assert.deepEqual(translateIndicators({ treasury: '', people: 'up' }), { food: 'up' });
  const next = gameReducer(loaded.state, { type: 'SELECT_SEASONAL_ACTION', payload: { optionIndex: 1 } });
  assert.equal(next.denarii, 520); assert.equal(next.food, 215); assert.equal(next.scribesNote, null);
  assert.equal(next.rngState, state.rngState); assert.doesNotThrow(() => writeV2Save(next));
});
