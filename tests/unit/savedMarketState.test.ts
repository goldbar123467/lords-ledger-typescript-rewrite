import {extraField} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
const counters = ['tradesThisSeason', 'totalTradesLifetime', 'totalHagglesWon', 'totalHagglesLost',
  'denariiEarnedFromTrade', 'denariiSpentOnTrade', 'quickTradesUsed', 'haggleTradesUsed'];
function rejects(market: unknown) {
  const state = { ...base, market }, before = JSON.stringify(state);
  assert.equal(readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state })).ok, false);
  assert.equal(readLegacySave(JSON.stringify(state)).ok, false);
  assert.throws(() => writeV2Save(state), /Save market/);
  assert.equal(JSON.stringify(state), before);
}
for (const key of counters) for (const [index, value] of ['3', false, [], {}].entries()) {
  test(`saved market ${key} malformed ${index}`, () => rejects({ ...base.market, [key]: value }));
}
for (const key of ['marketScribesNoteSeen', 'reputationScribesNoteSeen']) for (const [index, value] of [0, 'yes', [], {}].entries()) {
  test(`saved market ${key} malformed ${index}`, () => rejects({ ...base.market, [key]: value }));
}
for (const key of ['title', 'description', 'bannerColor']) for (const [index, value] of [42, false, [], {}].entries()) {
  test(`saved market event ${key} malformed ${index}`, () => rejects({ ...base.market, activeMarketEvent: { [key]: value } }));
}
for (const [index, value] of [42, false, [], 'blocked'].entries()) {
  test(`saved market event effect malformed ${index}`, () => rejects({ ...base.market, activeMarketEvent: { effect: value } }));
}
for (const [index, value] of [0, 'false', [], {}].entries()) {
  test(`saved market noHaggling malformed ${index}`, () => rejects({ ...base.market, activeMarketEvent: { effect: { noHaggling: value } } }));
}
for (const [index, value] of ['old-event', {}, [42], [null], [[]]].entries()) {
  test(`saved market event history malformed ${index}`, () => rejects({ ...base.market, usedMarketEventIds: value }));
}
for (const value of [undefined, null, 4.5]) test(`saved market historical defaults ${String(value)} retain bytes and trade continuation`, () => {
  const market = { reputation: {}, ...Object.fromEntries(counters.map(key => [key, value])),
    marketScribesNoteSeen: null, reputationScribesNoteSeen: null, usedMarketEventIds: null,
    activeMarketEvent: { title: null, description: 'Historical market wording', bannerColor: '', effect: { noHaggling: null, historicalRule: { kept: true } } },
    historicalExtension: { kept: true } };
  const state = { ...base, market }, before = JSON.stringify(state), raw = writeV2Save(state);
  const loaded = readV2Save(raw), legacy = readLegacySave(before);
  if (!loaded.ok) throw new Error(loaded.error); if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(JSON.stringify(loaded.state), before); assert.equal(JSON.stringify(legacy.state), before);
  assert.equal(writeV2Save(loaded.state), raw);
  const bargaining = gameReducer(loaded.state, { type: 'HAGGLE_START', payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' } });
  assert.ok(bargaining.market.activeHaggle);
  const settled = gameReducer(bargaining, { type: 'HAGGLE_ACCEPT' });
  assert.equal(settled.market.totalTradesLifetime, (value ?? 0) + 1);
  assert.equal(settled.market.haggleTradesUsed, (value ?? 0) + 1);
  assert.equal(settled.inventory.grain, base.inventory.grain - 1);
  assert.equal(settled.rngState, state.rngState);
  assert.deepEqual(extraField(settled.market, 'historicalExtension'), { kept: true });
  assert.doesNotThrow(() => writeV2Save(settled)); assert.equal(JSON.stringify(state), before);
});
test('saved market empty historical event and unknown fields retain exact bytes', () => {
  const state = { ...base, market: { reputation: { oldTrader: 37.5 }, activeMarketEvent: {}, usedMarketEventIds: ['unknown-old-event'],
    seasonalPriceModifiers: { historical: { retained: true } }, currentForeignTrader: { historical: true } } };
  const raw = writeV2Save(state), loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  assert.equal(writeV2Save(loaded.state), raw);
});
