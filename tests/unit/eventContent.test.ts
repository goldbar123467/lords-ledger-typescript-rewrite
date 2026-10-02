import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import seasonal from '../../src/data/seasonalEvents.ts';
import random from '../../src/data/randomEvents.ts';
import { selectRandomEvent, selectSeasonalEvent } from '../../src/engine/eventSelector.ts';

test('seasonal and random registries preserve all authored text, choices, effects, and ordering', () => {
  assert.equal(createHash('sha256').update(JSON.stringify({ seasonal, random })).digest('hex'),
    '3c1c9f2d3f8b0ee896fd81209e8a9b852b16045918ae3a75059555005760d3cc');
  const seasonalEvents = Object.values(seasonal).flat();
  const events = [...seasonalEvents, ...random];
  assert.equal(seasonalEvents.length, 28);
  assert.equal(random.length, 26);
  assert.equal(new Set(events.map(event => event.id)).size, 54, 'stable IDs are unique across registries');
  assert.equal(events.reduce((count, event) => count + event.options.length, 0), 148);
  assert.equal(events.filter(event => event.scribesNote !== null).length, 40);
  for (const [season, entries] of Object.entries(seasonal)) {
    assert.equal(entries.length, 7);
    for (const event of entries) assert.equal(event.season, season);
  }
});

test('every authored event can be selected within its actual season and meter gate', () => {
  const seasonalEvents = Object.values(seasonal).flat();
  for (const event of seasonalEvents) {
    const used = seasonalEvents.filter(other => other !== event).map(other => other.id);
    assert.equal(selectSeasonalEvent(event.season, used, 1, seasonalEvents, () => 0), event);
  }
  for (const event of random) {
    const used = random.filter(other => other !== event).map(other => other.id);
    const turn = event.requiresMeter === 'faith' ? 5 : event.requiresMeter === 'military' ? 3 : 1;
    assert.equal(selectRandomEvent(used, turn, random, () => 0), event);
    if (turn > 1) assert.notEqual(selectRandomEvent(used, turn - 1, random, () => 0), event);
  }
});
