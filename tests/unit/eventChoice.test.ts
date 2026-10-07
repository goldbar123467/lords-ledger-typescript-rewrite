import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import seasonal from '../../src/data/seasonalEvents.ts';
import random from '../../src/data/randomEvents.ts';
import { writeV2Save } from '../../src/save/saveGame.ts';
import { resolveEventChoice, type ChoiceEvent } from '../../src/engine/eventChoice.ts';

test('all authored event choices preserve complete transitions, saves, input and RNG', () => {
  const hash = createHash('sha256'); let cases = 0;
  for (const seed of [1, 104, 4294967295]) for (const difficulty of ['easy', 'normal', 'hard']) {
    const base = gameReducer(createInitialState(seed), { type: 'START_GAME', payload: { seed, difficulty } });
    for (const [kind, events] of [['seasonal', Object.values(seasonal).flat()], ['random', random]] as const) {
      for (const event of events) for (let optionIndex = 0; optionIndex < event.options.length; optionIndex++) {
        const state = { ...base, phase: kind === 'seasonal' ? 'seasonal_action' : 'random_event',
          currentEvent: kind === 'seasonal' ? event : null, currentRandomEvent: kind === 'random' ? event : null,
          causeChain: [0, 1, 2, 3].map(turn => ({ turn, season: 'winter' as const, year: -0.5, summary: 'Historical ' + turn })) };
        const before = JSON.stringify(state);
        const next = gameReducer(state, { type: kind === 'seasonal' ? 'SELECT_SEASONAL_ACTION' : 'SELECT_RANDOM_RESPONSE', payload: { optionIndex } });
        assert.equal(JSON.stringify(state), before); assert.equal(next.rngState, state.rngState);
        hash.update(JSON.stringify(next) + '\n' + writeV2Save(next) + '\n'); cases++;
      }
    }
  }
  assert.equal(cases, 1332);
  assert.equal(hash.digest('hex'), 'd20d8606ba881e0c071807281650ed746d0c39c63d038bb18ed949781c6ed6c4');
});

test('translated signed effects reconcile actual resource deltas and retain military extensions', () => {
  const initial = createInitialState(104), state = { ...initial, military: { ...initial.military, historicalTag: 'kept' } };
  const before = JSON.stringify(state);
  const result = resolveEventChoice(state, { id: 'example', options: [{ effects: { treasury: 5, faith: -1, people: 2, military: -6, population: -18 } }] }, 0, 'event');
  assert.equal(result.denarii, 545); assert.equal(result.food, 206);
  assert.equal(result.population, 2); assert.equal(result.garrison, 1);
  assert.deepEqual(result.resourceDeltas, { denarii: 45, food: 6, population: -18, garrison: -4 });
  assert.deepEqual(result.military?.garrison, { levy: 1, menAtArms: 0, knights: 0 });
  assert.equal(result.military?.morale, 32); assert.equal(result.military?.historicalTag, 'kept');
  assert.equal(result.gameOverReason, null); assert.equal(JSON.stringify(state), before);
});

test('recruitment uses actual population/max caps and losses remove the weakest soldiers first', () => {
  const base = createInitialState(104);
  const event = { id: 'example', options: [{ effects: { garrison: 40 } }] };
  const populationCap = resolveEventChoice(base, event, 0, 'action');
  assert.equal(populationCap.garrison, 12); assert.equal(populationCap.resourceDeltas.garrison, 7);
  assert.equal(populationCap.military?.garrison.levy, 12);
  const absoluteCap = resolveEventChoice({ ...base, population: 100 }, event, 0, 'action');
  assert.equal(absoluteCap.garrison, 25); assert.equal(absoluteCap.resourceDeltas.garrison, 20);
  const mixed = { ...base, military: { ...base.military, garrison: { levy: 2, menAtArms: 2, knights: 1 } } };
  const lost = resolveEventChoice(mixed, { id: 'example', options: [{ effects: { garrison: -4 } }] }, 0, 'action');
  assert.deepEqual(lost.military?.garrison, { levy: 0, menAtArms: 0, knights: 1 });
  assert.deepEqual(mixed.military.garrison, { levy: 2, menAtArms: 2, knights: 1 });
});

test('settlement checks depopulation, bankruptcy and famine in the existing priority', () => {
  const base = createInitialState(104), event = { id: 'example', options: [{ effects: { population: -20 } }] };
  assert.equal(resolveEventChoice({ ...base, bankruptcyTurns: 6, starvationTurns: 3 }, event, 0, 'event').gameOverReason?.type, 'depopulation');
  assert.equal(resolveEventChoice({ ...base, bankruptcyTurns: 6, starvationTurns: 3 }, { id: 'example' }, 0, 'event').gameOverReason?.type, 'bankruptcy');
  assert.equal(resolveEventChoice({ ...base, starvationTurns: 3 }, { id: 'example' }, 0, 'event').gameOverReason?.type, 'famine');
});

test('historical effect/text fallbacks and capped cause-chain preserve their ordering', () => {
  const base = createInitialState(104), history = [0, 1, 2, 3].map(turn => ({ turn, season: base.season, year: 0.5, summary: 'old ' + turn }));
  const event: ChoiceEvent = { id: 'historical', title: 'Event title', effects: { denarii: 7 }, scribesNote: 'Event note',
    options: [{ resultText: 'Old result', causeChainSummary: 'Old summary', scribesNote: 'Choice note' },
      { text: 'A'.repeat(100), effects: {}, chronicle: '', scribesNote: '' }] };
  const first = resolveEventChoice({ ...base, causeChain: history }, event, 0, 'action');
  assert.equal(first.denarii, 507); assert.equal(first.chronicle.at(-1)?.text, 'Old result');
  assert.equal(first.scribesNote, 'Choice note');
  assert.deepEqual(first.causeChain.map(entry => entry.summary), ['old 1', 'old 2', 'old 3', 'Old summary']);
  const empty = resolveEventChoice(base, event, 1, 'event');
  assert.equal(empty.denarii, 500); assert.equal(empty.chronicle.at(-1)?.text, ''); assert.equal(empty.scribesNote, '');
  assert.equal(empty.causeChain.at(-1)?.summary, 'A'.repeat(80));
  const missing = resolveEventChoice(base, event, -1, 'event');
  assert.equal(missing.denarii, 500); assert.equal(missing.chronicle.at(-1)?.text, 'Event title');
  assert.equal(missing.scribesNote, 'Event note');
  assert.equal(resolveEventChoice(base, { id: 'historical' }, 0, 'event').causeChain.at(-1)?.summary, 'Turn choice at event historical');
});
