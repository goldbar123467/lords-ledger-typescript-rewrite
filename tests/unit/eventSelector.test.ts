import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRandomEvent, selectSeasonalEvent } from '../../src/engine/eventSelector.ts';

test('seasonal selection favors unused events of the requested season without mutating inputs', () => {
  const events = [
    { id: 'spring-a', season: 'spring' },
    { id: 'spring-b', season: 'spring' },
    { id: 'summer-a', season: 'summer' },
  ];
  const used = ['spring-a'];
  assert.equal(selectSeasonalEvent('spring', used, 1, events, () => 0), events[1]);
  assert.deepEqual(events.map(event => event.id), ['spring-a', 'spring-b', 'summer-a']);
  assert.deepEqual(used, ['spring-a']);
  assert.equal(selectSeasonalEvent('spring', ['spring-a', 'spring-b'], 2, events, () => 0), events[0]);
  assert.equal(selectSeasonalEvent('winter', [], 3, events, () => 0.99), events[2]);
});

test('random event gates stay closed until their actual turn thresholds', () => {
  const events = [
    { id: 'ordinary' },
    { id: 'military', requiresMeter: 'military' },
    { id: 'faith', requiresMeter: 'faith' },
  ];
  assert.equal(selectRandomEvent(['ordinary'], 2, events, () => 0), events[0]);
  assert.equal(selectRandomEvent(['ordinary'], 3, events, () => 0), events[1]);
  assert.equal(selectRandomEvent(['ordinary', 'military'], 5, events, () => 0), events[2]);
  assert.equal(selectRandomEvent([], 1, [], () => 0), null);
});

test('injected random input is repeatable and must be a valid unit interval draw', () => {
  const events = [{ id: 'a' }, { id: 'b' }];
  assert.equal(selectRandomEvent([], 1, events, () => 0.75)?.id, 'b');
  assert.equal(selectRandomEvent([], 1, events, () => 0.75)?.id, 'b');
  assert.throws(() => selectRandomEvent([], 1, events, () => 1), RangeError);
});
