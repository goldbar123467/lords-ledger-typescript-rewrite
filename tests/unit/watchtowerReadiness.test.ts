import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialMilitaryState } from '../../src/data/military.ts';
import { RODERIC_DEFENSE_ASSESSMENTS, RODERIC_STRATEGIC_TIPS } from '../../src/data/watchtower.ts';
import { getMilitaryReadiness } from '../../src/engine/militaryReadiness.ts';
import { calculateForgeReadiness } from '../../src/engine/forgeReadiness.ts';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';

const base = { turn: 8, garrison: 5, castleLevel: 1 as const, food: 200, denarii: 500,
  military: getInitialMilitaryState() };
const assessment = RODERIC_DEFENSE_ASSESSMENTS[0];
const castle = RODERIC_DEFENSE_ASSESSMENTS[1];
const criminal = RODERIC_STRATEGIC_TIPS[0];
const scottish = RODERIC_STRATEGIC_TIPS[1];
if (!assessment || !castle || !criminal || !scottish) throw new Error('Captain response missing');

test('captain reports the actual morale-adjusted rating and authored threat threshold', () => {
  for (const [morale, rating] of [[0, 11], [1, 11], [50, 15], [61, 17]] as const) {
    const text = criminal({ ...base, military: { ...base.military, morale } });
    assert.match(text ?? '', new RegExp(`rating is ${rating}`));
    assert.match(text ?? '', /need 18/);
  }
  assert.equal(criminal({ ...base, military: { ...base.military, morale: 100 } }), null);
});

test('captain does not recommend defenses against an already defended threat', () => {
  assert.equal(criminal({ ...base, castleLevel: 2, military: { ...base.military, walls: 2 } }), null);
  assert.equal(scottish({ ...base, garrison: 10, castleLevel: 3, military: {
    ...base.military, walls: 3, garrison: { levy: 10, menAtArms: 0, knights: 0 },
  } }), null);
});

test('captain distinguishes soldier numbers from fortification defense and names built walls', () => {
  const fortified = { ...base, garrison: 0, castleLevel: 4 as const, military: {
    ...base.military, walls: 4 as const, gate: 4 as const, moat: 3 as const,
    garrison: { levy: 0, menAtArms: 0, knights: 0 },
  } };
  assert.match(assessment(fortified) ?? '', /78/);
  assert.doesNotMatch(assessment(fortified) ?? '', /we fall|any raiding force/);
  assert.match(castle({ ...base, castleLevel: 2, military: { ...base.military, walls: 2 } }) ?? '', /Stone Curtain Wall/);
  assert.doesNotMatch(castle({ ...base, castleLevel: 2, military: { ...base.military, walls: 2 } }) ?? '', /palisade holds|wood burns/);
});

test('equipment, drills and scouting produce threat-specific readiness without mutating inputs', () => {
  const equipment = [{ category: 'weapon', militaryBonus: 8, qualityScore: 90 }];
  assert.deepEqual(calculateForgeReadiness(equipment, 5),
    { readiness: 35, armed: 1, armored: 0, quality: 90, defenseBonus: 4 });
  const state = { ...base, blacksmith: { equipped: equipment }, tavern: { aldricDrillActive: 1 },
    watchtower: { warnings: { criminalRaidBonus: 2, scottishRaidBonus: 3, raidRequirementReduction: 2 } } };
  const snapshot = structuredClone(state);
  const readiness = getMilitaryReadiness(state);
  assert.equal(readiness.baseDefense, 24);
  assert.equal(readiness.criminalDefense, 28);
  assert.equal(readiness.scottishDefense, 29);
  assert.equal(readiness.criminalDefended, true);
  assert.equal(readiness.scottishDefended, false);
  assert.match(scottish(state) ?? '', /rating is 29.*need 38/);
  assert.deepEqual(state, snapshot);
});

test('raid resolution uses the same threat rating and preserves a captured third-season drill', () => {
  const initial = createInitialState(104);
  for (const [type, defenseRating, threshold] of [['criminal', 28, 18], ['scottish', 29, 38]] as const) {
    const state = { ...initial, phase: 'raid_warning',
      tavern: { ...initial.tavern, aldricDrillActive: 0 },
      blacksmith: { ...initial.blacksmith, equipped: [{ category: 'weapon', militaryBonus: 8, qualityScore: 90 }] },
      watchtower: { ...initial.watchtower, warnings: { criminalRaidBonus: 2, scottishRaidBonus: 3, raidRequirementReduction: 2 } },
      raids: { ...initial.raids, activeRaid: { type, phase: 'warning', drillBonus: 5 } },
    };
    const next = gameReducer(state, { type: 'RAID_DEFEND' });
    assert.equal(next.phase, 'raid_result');
    assert.equal(next.raids.activeRaid.defenseRating, defenseRating);
    assert.equal(next.raids.activeRaid.defenseThreshold, threshold);
    assert.equal(next.raids.activeRaid.drillBonus, 5);
    assert.equal(next.raids.activeRaid.result.victory, type === 'criminal');
  }
});
