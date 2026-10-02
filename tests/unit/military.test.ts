import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as military from '../../src/data/military.ts';

test('military definitions, narrative and tuning match the original exports', () => {
  const data = Object.fromEntries(Object.entries(military).filter(([, value]) => typeof value !== 'function'));
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    '05ca774ede13e0e9fac7365b6ee13501d20d7a303386e5e670f9c5ae917a3dfa');
  for (const track of [military.WALLS_TRACK, military.GATE_TRACK, military.MOAT_TRACK]) {
    assert.deepEqual(track.map(step => step.level), track.map((_, index) => index));
  }
});

test('defense preserves fortification, morale and flat bonus ordering', () => {
  const initial = military.getInitialMilitaryState();
  assert.equal(military.calculateDefenseRating(initial), 15);
  const fortified = { ...initial, garrison: { levy: 5, menAtArms: 3, knights: 1 }, walls: 4, gate: 4, moat: 3, morale: 100 };
  assert.equal(military.calculateDefenseRating(fortified, 5), 130);
  assert.equal(military.getDefenseBreakdown(fortified, 5, 3).total, 133);
  assert.equal(military.getTotalGarrison(fortified.garrison), 9);
  assert.equal(military.getMilitaryUpkeep(fortified.garrison), 25);
  assert.deepEqual(military.removeFromGarrison(fortified.garrison, 7), { levy: 0, menAtArms: 1, knights: 1 });
  assert.deepEqual(fortified.garrison, { levy: 5, menAtArms: 3, knights: 1 });
  assert.deepEqual(military.removeFromGarrison(fortified.garrison, 100), { levy: 0, menAtArms: 0, knights: 0 });
});

test('fortification prerequisites and the maximum level retain their authored rules', () => {
  assert.deepEqual(military.canUpgradeFortification('gate', { walls: 1, gate: 2, moat: 0 }),
    { canUpgrade: false, reason: 'Requires: Stone Curtain Wall' });
  const upgrade = military.canUpgradeFortification('gate', { walls: 2, gate: 2, moat: 0 });
  assert.equal(upgrade.canUpgrade, true);
  if (upgrade.canUpgrade) assert.equal(upgrade.next, military.GATE_TRACK[3]);
  assert.deepEqual(military.canUpgradeFortification('moat', { walls: 4, gate: 4, moat: 3 }),
    { canUpgrade: false, reason: 'Maximum level reached' });
  const first = military.getInitialMilitaryState();
  const second = military.getInitialMilitaryState();
  first.garrison.levy = 0;
  first.scribesNoteSeen.castleEvolution = true;
  assert.equal(second.garrison.levy, 5);
  assert.equal(second.scribesNoteSeen.castleEvolution, false);
});
