import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { writeV2Save } from '../../src/save/saveGame.ts';

const seeds = [0, 1, 104, 4294967295, ...Array.from({ length: 100 }, (_, index) => index + 200)];
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
test('104 seeded constructor states and canonical saves preserve the pre-extraction bytes', () => {
  const rows = seeds.map(seed => {
    const state = createInitialState(seed);
    return { seed, initial: digest(JSON.stringify(state)), save: digest(writeV2Save(state)), rngState: state.rngState };
  });
  // Captured from unchanged 6bc91ee. Initializations are not campaigns.
  assert.equal(digest(JSON.stringify(rows)), '9d43d3b49b27fbd556fb091d1b4956b82790469e84a05812f9593e6b1333100e');
});
test('all three difficulties preserve 312 starts and 312 same-seed replay states and saves', () => {
  const rows = seeds.map(seed => {
    const initial = createInitialState(seed);
    const starts = ['easy', 'normal', 'hard'].map(difficulty => {
      const started = gameReducer(initial, { type: 'START_GAME', payload: { difficulty, seed } });
      const replayed = gameReducer(started, { type: 'PLAY_AGAIN', payload: { difficulty, seed } });
      return { difficulty, start: digest(JSON.stringify(started)), startSave: digest(writeV2Save(started)),
        replay: digest(JSON.stringify(replayed)), replaySave: digest(writeV2Save(replayed)) };
    });
    return { seed, starts };
  });
  assert.equal(digest(JSON.stringify(rows)), 'f4d1882266e974198468a1d8b9e56eed559326da4f9a55f0832b04cb1b96ab7b');
});
test('fresh games independently own their mutable inventories, garrison, families, meters and queues', () => {
  const first = createInitialState(104), second = createInitialState(104);
  const before = JSON.stringify(second);
  first.inventory.grain += 7; first.military.garrison.levy += 1; first.greatHall.meters.people = 0;
  first.tavern.ratsPlayedThisSeason = true;
  const family = first.people.notableFamilies[0]; assert.ok(family); family.present = false;
  first.usedSeasonalIds.push('isolation-probe'); first.watchtower.signalLog.push({ turn: 1, season: 'spring', year: 1, text: 'isolation-probe', type: 'scan' });
  assert.notEqual(first.blacksmith.inventory, second.blacksmith.inventory);
  assert.notEqual(first.chapel.msPattern, second.chapel.msPattern);
  assert.notEqual(first.marketPrices.sell, second.marketPrices.sell);
  assert.equal(JSON.stringify(second), before);
  assert.equal(JSON.stringify(createInitialState(104)), before);
});
