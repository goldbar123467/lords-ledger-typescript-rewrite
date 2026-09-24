import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readLegacySave, readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import seasonalEvents from '../../src/data/seasonalEvents.js';
import gameReducer from '../../src/engine/gameReducer.js';
import { checkGameOver } from '../../src/engine/meterUtils.js';

const fixtureUrl = new URL('../fixtures/legacy-normal-turn1.json', import.meta.url);
const legacyRaw = await readFile(fixtureUrl, 'utf8');

test('current legacy save imports without changing its contents', () => {
  const before = legacyRaw;
  const result = readLegacySave(legacyRaw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.inventory.grain, 280);
  assert.equal(typeof result.state.rngState, 'number');
  assert.equal(legacyRaw, before);
  const roundTrip = readV2Save(writeV2Save(result.state));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) assert.deepEqual(roundTrip.state, result.state);
});

test('older saves gain a stable random state while invalid saved states are rejected', () => {
  const first = readLegacySave(legacyRaw);
  const second = readLegacySave(legacyRaw);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.state.rngState, second.state.rngState);
  const oldV2 = { format: 'lords-ledger', version: 2, state: JSON.parse(legacyRaw) };
  const migratedV2 = readV2Save(JSON.stringify(oldV2));
  assert.equal(migratedV2.ok, true);
  if (migratedV2.ok) assert.equal(migratedV2.state.rngState, first.state.rngState);
  const damaged = readV2Save(JSON.stringify({ ...oldV2, state: { ...first.state, rngState: -1 } }));
  assert.equal(damaged.ok, false);
  if (!damaged.ok) assert.match(damaged.error, /random state/i);
});

test('a reducer-style loss reason round trips and malformed reasons are rejected', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const reason = checkGameOver({ population: 0, bankruptcyTurns: 0, starvationTurns: 0, difficulty: 'normal' });
  assert.ok(reason);
  const loss = { ...imported.state, phase: 'game_over', population: 0, gameOverReason: reason };
  const roundTrip = readV2Save(writeV2Save(loss));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) assert.deepEqual(roundTrip.state.gameOverReason, reason);
  const damaged = readLegacySave(JSON.stringify({ ...loss, gameOverReason: { type: 'unknown', reason: 'lost' } }));
  assert.equal(damaged.ok, false);
});

test('malformed save shape is rejected rather than loaded', () => {
  const result = readLegacySave('{}');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /phase/i);
});

test('invalid JSON is rejected with a recoverable message', () => {
  const result = readLegacySave('{');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /valid JSON/i);
});

test('unknown envelope versions are rejected', () => {
  const result = readV2Save(JSON.stringify({ format: 'lords-ledger', version: 99, state: JSON.parse(legacyRaw) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /version 99/i);
});

test('a pending event requires its original choices to continue', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const changed = { ...imported.state, phase: 'seasonal_action', currentEvent: null };
  const result = readLegacySave(JSON.stringify(changed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /pending event/i);
});

test('an unknown pending event ID with zero choices is rejected', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const changed = {
    ...imported.state,
    phase: 'seasonal_action',
    currentEvent: { id: 'not-a-real-event', options: [] },
  };
  const result = readLegacySave(JSON.stringify(changed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /event ID is not recognized/i);
});

test('a known pending event cannot lose its choices', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const changed = {
    ...imported.state,
    phase: 'seasonal_action',
    currentEvent: { id: 'spring_1', options: [] },
  };
  const result = readLegacySave(JSON.stringify(changed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /missing choices/i);
});

test('a known pending event rejects damaged numeric effects before play', () => {
  const source = JSON.parse(legacyRaw);
  const authored = seasonalEvents.spring.find(event => event.id === 'spring_1');
  assert.ok(authored);
  const damaged = { ...authored, options: authored.options.map((option, index) =>
    index === 0 ? { ...option, effects: { denarii: 'damaged' } } : option) };
  const result = readLegacySave(JSON.stringify({ ...source, phase: 'seasonal_action', currentEvent: damaged }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /event.*effect/i);
});

test('a known pending event rejects an altered but finite authored effect', () => {
  const source = JSON.parse(legacyRaw);
  const authored = seasonalEvents.spring.find(event => event.id === 'spring_1');
  assert.ok(authored);
  const altered = { ...authored, options: authored.options.map((option, index) =>
    index === 0 ? { ...option, effects: { ...option.effects, treasury: 999999 } } : option) };
  const result = readLegacySave(JSON.stringify({ ...source, phase: 'seasonal_action', currentEvent: altered }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /event.*effect/i);
});

test('a saved flip decision requires a recognized active scene', () => {
  const source = JSON.parse(legacyRaw);
  const missingFlip = readLegacySave(JSON.stringify({ ...source, phase: 'flip_decision', currentFlipId: null }));
  assert.equal(missingFlip.ok, false);
  if (!missingFlip.ok) assert.match(missingFlip.error, /pending perspective shift/i);

  const validFlip = readLegacySave(JSON.stringify({
    ...source,
    phase: 'flip_decision',
    currentFlipId: 'serf_week',
    currentFlipStats: { hunger: 60, energy: 70, family: 50 },
  }));
  assert.equal(validFlip.ok, true);
  const missingScene = readLegacySave(JSON.stringify({
    ...source,
    phase: 'flip_decision',
    currentFlipId: 'cyoa_lord',
    currentFlipStats: {},
    currentCyoaNodeId: null,
  }));
  assert.equal(missingScene.ok, false);
  if (!missingScene.ok) assert.match(missingScene.error, /perspective shift scene/i);
});

test('a saved raid phase requires a matching pending raid', () => {
  const source = JSON.parse(legacyRaw);
  for (const phase of ['raid_warning', 'raid_result']) {
    const missing = readLegacySave(JSON.stringify({ ...source, phase, raids: { ...source.raids, activeRaid: null } }));
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /pending raid/i);
  }
  const warning = readLegacySave(JSON.stringify({
    ...source,
    phase: 'raid_warning',
    raids: { ...source.raids, activeRaid: { type: 'criminal', phase: 'warning', result: null } },
  }));
  assert.equal(warning.ok, true);
});

test('a reducer-produced defeated raid result remains savable with a fractional defense ratio', () => {
  const source = JSON.parse(legacyRaw);
  const warning = {
    ...source,
    phase: 'raid_warning',
    turn: 3,
    season: 'autumn',
    garrison: 0,
    military: { ...source.military, garrison: { levy: 0, menAtArms: 0, knights: 0 } },
    raids: { ...source.raids, activeRaid: { type: 'criminal', phase: 'warning', result: null } },
  };
  assert.equal(readLegacySave(JSON.stringify(warning)).ok, true);
  const result = gameReducer(warning, { type: 'RAID_DEFEND' });
  assert.equal(result.phase, 'raid_result');
  assert.equal(result.raids.activeRaid.result.defenseRatio, 10 / 18);
  const v2Raw = writeV2Save(result);
  const decoded = readV2Save(v2Raw);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.state, JSON.parse(JSON.stringify(result)));
});

test('duplicate building instance IDs are rejected', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const first = imported.state.buildings[0];
  assert.ok(first && typeof first !== 'string');
  const changed = { ...imported.state, buildings: [...imported.state.buildings, { ...first }] };
  const result = readLegacySave(JSON.stringify(changed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /duplicate ID/i);
});

test('unknown building IDs cannot load from either save format, including legacy string entries', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const knownLegacy = { ...imported.state, buildings: [...imported.state.buildings, 'strip_farm'] };
  assert.equal(readLegacySave(JSON.stringify(knownLegacy)).ok, true);
  assert.equal(readV2Save(writeV2Save(knownLegacy)).ok, true);

  for (const unknown of [
    'dragon_keep',
    { instanceId: 'dragon_keep-1', type: 'dragon_keep', condition: 100, builtOnTurn: 1 },
  ]) {
    const changed: unknown = { ...imported.state, buildings: [...imported.state.buildings, unknown] };
    assert.throws(() => writeV2Save(changed), /building.*(type|ID).*not recognized/i);
    const envelope = { format: 'lords-ledger', version: 2, state: changed };
    for (const result of [readLegacySave(JSON.stringify(changed)), readV2Save(JSON.stringify(envelope))]) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /building.*(type|ID).*not recognized/i);
    }
  }
});

test('optional purchased provisions must have finite nonnegative quantities in imported saves', () => {
  const source = JSON.parse(legacyRaw);
  for (const resource of ['salt', 'tools', 'spices']) {
    for (const quantity of [-1, '5', null]) {
      const changed = { ...source, inventory: { ...source.inventory, [resource]: quantity } };
      const result = readLegacySave(JSON.stringify(changed));
      assert.equal(result.ok, false, `${resource}=${String(quantity)} should be rejected`);
      if (!result.ok) assert.match(result.error, new RegExp(`inventory\\.${resource}`));
    }
    const valid = { ...source, inventory: { ...source.inventory, [resource]: 5 } };
    assert.equal(readLegacySave(JSON.stringify(valid)).ok, true);
  }
});

test('an unrecognized inventory key cannot load and distort storehouse capacity', () => {
  const source = JSON.parse(legacyRaw);
  const changed = { ...source, inventory: { ...source.inventory, dragon_eggs: -100 } };
  const v2 = { format: 'lords-ledger', version: 2, state: changed };
  for (const result of [readLegacySave(JSON.stringify(changed)), readV2Save(JSON.stringify(v2))]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /inventory\.dragon_eggs.*not recognized/i);
  }
  assert.throws(() => writeV2Save(changed), /inventory\.dragon_eggs.*not recognized/i);
});

test('an imported tax rate must be one of the authored rates', () => {
  const source = JSON.parse(legacyRaw);
  const changed = { ...source, taxRate: 'royal' };
  const result = readLegacySave(JSON.stringify(changed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /tax rate/i);
});

test('turn and season disagreement is rejected', () => {
  const imported = readLegacySave(legacyRaw);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const result = readLegacySave(JSON.stringify({ ...imported.state, turn: 2, season: 'spring' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /disagree/i);
});
