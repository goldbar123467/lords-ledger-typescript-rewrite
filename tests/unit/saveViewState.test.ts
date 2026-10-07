import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { FLIP_STAT_IDS } from '../../src/data/flipTypes.ts';

const base = createInitialState(104);
const malformed: Array<{ name: string; patch: object }> = [
  { name: 'resource delta', patch: { resourceDeltas: { denarii: 'lots', food: 0, population: 0, garrison: 0 } } },
  { name: 'cause-chain turn', patch: { causeChain: [{ turn: '1', season: 'spring' as const, year: 1, summary: 'Earlier choice' }] } },
  { name: 'cause-chain summary', patch: { causeChain: [{ turn: 1, season: 'spring' as const, year: 1, summary: {} }] } },
  { name: 'pending notification', patch: { pendingSynergyNotifications: [true] } },
  { name: 'deferred notification container', patch: { deferredSynergyNotifications: {} } },
  { name: 'deferred notification entry', patch: { deferredSynergyNotifications: [true] } },
  { name: 'scribe text', patch: { scribesNote: true } },
  { name: 'inactive flip ID', patch: { currentFlipId: [] } },
  { name: 'inactive flip stat', patch: { currentFlipStats: { [FLIP_STAT_IDS[0]]: 'lots' } } },
  { name: 'inactive flip outcome', patch: { currentFlipOutcome: {} } },
  { name: 'inactive story node', patch: { currentCyoaNodeId: [] } },
  { name: 'inactive ending tag', patch: { cyoaEndingType: 'invented' } },
  { name: 'inactive outcome success', patch: { flipOutcomeWasSuccess: 'yes' } },
  { name: 'inactive loss reason', patch: { gameOverReason: true } },
  { name: 'tutorial list', patch: { tutorialsSeen: [false] } },
  { name: 'season report', patch: { seasonReport: [null] } },
  { name: 'seasonal ID list', patch: { usedSeasonalIds: [123] } },
  { name: 'random ID list', patch: { usedRandomIds: [false] } },
  { name: 'consequence flag list', patch: { flipConsequenceFlags: [{}] } },
  { name: 'defense history list', patch: { defenseUpgrades: [{}] } },
  { name: 'economy history', patch: { economyHistory: [{ turn: '1', season: 'spring' as const, netGold: 0, netFood: 0 }] } },
  { name: 'legacy labor allocation', patch: { laborAllocation: { demesne: 'lots', peasant: 40, construction: 20 } } },
  { name: 'completed perspective marker', patch: { perspectiveFlips: { ...base.perspectiveFlips, serf_week: 'yes' } } },
];
for (const row of malformed) test(`malformed ${row.name} rejects in v2 and legacy readers and writer`, () => {
    const state = { ...base, ...row.patch };
    const modern = readV2Save(JSON.stringify({ format: 'lords-ledger', version: 2, state }));
    const legacy = readLegacySave(JSON.stringify(state));
    assert.equal(modern.ok, false, row.name + '/v2'); assert.equal(legacy.ok, false, row.name + '/legacy');
    assert.throws(() => writeV2Save(state), /Save /, row.name + '/writer');
});

test('omitted, null and empty deferred queues preserve bytes and permit story continuation', () => {
  for (const patch of [{}, { deferredSynergyNotifications: null }, { deferredSynergyNotifications: [] }]) {
    const state = { ...base, phase: 'flip_summary' as const, currentFlipId: 'serf_week', currentFlipStats: { hunger: 60, energy: 70, family: 50 }, ...patch };
    const raw = writeV2Save(state), loaded = readV2Save(raw);
    if (!loaded.ok) throw new Error(loaded.error);
    assert.equal(writeV2Save(loaded.state), raw);
    const next = gameReducer(loaded.state, { type: 'DISMISS_FLIP_SUMMARY' });
    assert.equal(next.phase, 'management');
    assert.doesNotThrow(() => writeV2Save(next));
  }
});
test('ordinary metadata and unknown extensions retain exact save bytes', () => {
  const state = { ...base, tutorialsSeen: ['estate', 'old_tab_name'], defenseUpgrades: ['old_defense_name'],
    causeChain: [{ turn: 1, season: 'spring' as const, year: 1, summary: 'Historical choice', historicalLabel: 'Kept' }],
    economyHistory: [{ turn: 1, season: 'spring' as const, netGold: -4.5, netFood: 3.25, oldLabel: 'Kept' }],
    resourceDeltas: { denarii: -4.5, food: 3.25, population: 0, garrison: 0, oldLabel: 'Kept' },
    currentFlipStats: { [FLIP_STAT_IDS[0]]: 4.5, futureStat: { historical: true } },
    perspectiveFlips: { ...base.perspectiveFlips, historicalFlag: { old: true } },
    unusedExtension: { untouched: true } };
  const raw = writeV2Save(state), loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  assert.deepEqual(loaded.state, state); assert.equal(writeV2Save(loaded.state), raw);
  const legacy = readLegacySave(JSON.stringify(state));
  if (!legacy.ok) throw new Error(legacy.error);
  assert.deepEqual(legacy.state, state);
});
