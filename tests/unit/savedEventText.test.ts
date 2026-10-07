import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import seasonal from '../../src/data/seasonalEvents.ts';
import random from '../../src/data/randomEvents.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
const fields = ['event note', 'choice note', 'choice summary'] as const;
const badValues = [true, false, 0, 17, [], {}];
for (const kind of ['seasonal', 'random'] as const) for (const field of fields) for (const [index, value] of badValues.entries()) {
  test(`${kind} ${field} malformed value ${index} rejects before settlement`, () => {
    const authored = kind === 'seasonal' ? seasonal.spring[0] : random[0];
    if (!authored) throw new Error('Missing authored event.');
    const event = { ...authored, ...(field === 'event note' ? { scribesNote: value } : {}),
      options: authored.options.map((option, optionIndex) => optionIndex === 0 ? { ...option,
        ...(field === 'choice note' ? { scribesNote: value } : {}), ...(field === 'choice summary' ? { causeChainSummary: value } : {}) } : option) };
    const state = { ...base, phase: kind === 'seasonal' ? 'seasonal_action' : 'random_event',
      currentEvent: kind === 'seasonal' ? event : null, currentRandomEvent: kind === 'random' ? event : null };
    const before = JSON.stringify(state);
    assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
    assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
    assert.throws(() => writeV2Save(state), /Save .*event/);
    assert.equal(JSON.stringify(state), before);
  });
}

for (const value of [null, '', 'Historical text']) test(`compatible optional prose ${JSON.stringify(value)} preserves bytes and continuation`, () => {
  for (const kind of ['seasonal', 'random'] as const) {
    const authored = kind === 'seasonal' ? seasonal.spring[0] : random[0];
    if (!authored) throw new Error('Missing authored event.');
    const event = { ...authored, scribesNote: value, oldEventExtension: { kept: true },
      options: authored.options.map(option => ({ ...option, scribesNote: value, causeChainSummary: value,
        resultText: { unusedBecauseChronicleIsRequired: true }, oldChoiceExtension: ['kept'] })) };
    const state = { ...base, phase: kind === 'seasonal' ? 'seasonal_action' : 'random_event',
      currentEvent: kind === 'seasonal' ? event : null, currentRandomEvent: kind === 'random' ? event : null };
    const raw = writeV2Save(state), loaded = readV2Save(raw), legacy = readLegacySave(JSON.stringify(state));
    if (!loaded.ok) throw new Error(loaded.error);
    if (!legacy.ok) throw new Error(legacy.error);
    assert.deepEqual(loaded.state, state); assert.deepEqual(legacy.state, state);
    assert.equal(writeV2Save(loaded.state), raw);
    const next = gameReducer(loaded.state, { type: kind === 'seasonal' ? 'SELECT_SEASONAL_ACTION' : 'SELECT_RANDOM_RESPONSE', payload: { optionIndex: 0 } });
    assert.equal(next.scribesNote, value);
    assert.equal(next.causeChain.at(-1)?.summary, value || authored.options[0].text.slice(0, 80));
    assert.equal(next.chronicle.at(-1)?.text, authored.options[0].chronicle);
    assert.equal(next.rngState, state.rngState); assert.equal(writeV2Save(loaded.state), raw);
    assert.doesNotThrow(() => writeV2Save(next));
  }
});

test('omitted/null option notes retain the event fallback while empty notes suppress it', () => {
  const authored = seasonal.spring[0];
  for (const eventNote of [undefined, 'Historical event note']) for (const optionNote of [undefined, null, '']) {
    const event = { ...authored, scribesNote: eventNote,
      options: authored.options.map(option => ({ ...option, scribesNote: optionNote, causeChainSummary: null })) };
    const state = { ...base, phase: 'seasonal_action', currentEvent: event }, raw = writeV2Save(state), loaded = readV2Save(raw);
    if (!loaded.ok) throw new Error(loaded.error);
    assert.equal(writeV2Save(loaded.state), raw);
    const next = gameReducer(loaded.state, { type: 'SELECT_SEASONAL_ACTION', payload: { optionIndex: 0 } });
    assert.equal(next.scribesNote, optionNote ?? eventNote ?? null);
    assert.equal(next.causeChain.at(-1)?.summary, authored.options[0].text.slice(0, 80));
    assert.doesNotThrow(() => writeV2Save(next));
  }
});
