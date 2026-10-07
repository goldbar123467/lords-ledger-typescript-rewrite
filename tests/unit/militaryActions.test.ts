import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialMilitaryState, MILITARY_SCRIBES_NOTES } from '../../src/data/military.ts';
import { planMilitaryAction, type MilitaryCommandState } from '../../src/engine/militaryActions.ts';

function state(): MilitaryCommandState {
  return { phase: 'management' as const, denarii: 500, population: 20, garrison: 5,
    castleLevel: 1, military: getInitialMilitaryState(), scribesNote: null };
}

test('recruitment respects shared population capacity and exact spending without mutation', () => {
  const before = state();
  const snapshot = structuredClone(before);
  const change = planMilitaryAction(before, 'RECRUIT_SOLDIERS', { count: 100 });
  assert.ok(change);
  assert.equal(change.patch.garrison, 12);
  assert.equal(change.patch.denarii, 465);
  assert.equal(change.patch.military.totalRecruitmentSpending, 35);
  assert.equal(change.chronicleText, 'Recruited 7 levy peasants for 35d.');
  assert.deepEqual(before, snapshot);
});

test('knights require population and apply their authored morale bonus', () => {
  const before = state();
  assert.equal(planMilitaryAction({ ...before, population: 9 }, 'RECRUIT_SOLDIERS', { count: 1, soldierType: 'knights' }), null);
  const change = planMilitaryAction(before, 'RECRUIT_SOLDIERS', { count: 1, soldierType: 'knights' });
  assert.ok(change);
  assert.equal(change.patch.denarii, 450);
  assert.equal(change.patch.garrison, 6);
  assert.equal(change.patch.military.garrison.knights, 1);
  assert.equal(change.patch.military.morale, 55);
});

test('dismissal caps to actual troops and never refunds their cost', () => {
  const change = planMilitaryAction(state(), 'DISMISS_SOLDIERS', { count: 100 });
  assert.ok(change);
  assert.equal(change.patch.garrison, 0);
  assert.equal(Object.hasOwn(change.patch, 'denarii'), false);
  assert.equal(change.patch.military.morale, 45);
  assert.equal(change.chronicleText, 'Dismissed 5 levy peasants.');
});

test('wall upgrade is atomic and preserves its once-only educational note', () => {
  const before = state();
  const snapshot = structuredClone(before);
  const change = planMilitaryAction(before, 'UPGRADE_FORTIFICATION', { track: 'walls' });
  assert.ok(change);
  assert.equal(change.patch.denarii, 380);
  assert.equal(change.patch.castleLevel, 2);
  assert.equal(change.patch.military.walls, 2);
  assert.equal(change.patch.military.morale, 60);
  assert.equal(change.patch.military.totalFortificationSpending, 120);
  assert.equal(change.patch.scribesNote, MILITARY_SCRIBES_NOTES.castleEvolution);
  assert.equal(change.patch.military.scribesNoteSeen?.castleEvolution, true);
  assert.deepEqual(before, snapshot);
  assert.ok(before.military);
  const seen = { ...before, scribesNote: 'An existing note.', military: {
    ...before.military, scribesNoteSeen: { castleEvolution: true },
  } };
  assert.equal(planMilitaryAction(seen, 'UPGRADE_FORTIFICATION', { track: 'walls' })?.patch.scribesNote, 'An existing note.');
});

test('locked tracks, unavailable resources and non-management commands are no-ops', () => {
  const before = state();
  assert.ok(before.military);
  const blocked = { ...before, military: { ...before.military, gate: 2 as const } };
  assert.equal(planMilitaryAction(blocked, 'UPGRADE_FORTIFICATION', { track: 'gate' }), null);
  assert.equal(planMilitaryAction({ ...before, denarii: 119 }, 'UPGRADE_FORTIFICATION', { track: 'walls' }), null);
  assert.equal(planMilitaryAction(before, 'UPGRADE_FORTIFICATION', { track: 'constructor' }), null);
  assert.equal(planMilitaryAction(before, 'RECRUIT_SOLDIERS', { count: 0.5 }), null);
  assert.equal(planMilitaryAction(before, 'DISMISS_SOLDIERS', { count: 1, soldierType: '__proto__' }), null);
  for (const type of ['RECRUIT_SOLDIERS', 'DISMISS_SOLDIERS', 'UPGRADE_FORTIFICATION'] as const) {
    assert.equal(planMilitaryAction({ ...before, phase: 'raid_warning' as const }, type, { count: 1, track: 'walls' }), null);
  }
});

test('missing military substate retains the existing aggregate fallback', () => {
  const before = { ...state(), military: null };
  const change = planMilitaryAction(before, 'DISMISS_SOLDIERS', { count: 1 });
  assert.ok(change);
  assert.equal(change.patch.military.garrison.levy, 4);
  assert.equal(change.patch.garrison, 4);
});

test('valid zero morale stays zero on dismissal and earns only explicit upgrade bonuses', () => {
  const before = state();
  assert.ok(before.military);
  const zero = { ...before, military: { ...before.military, morale: 0 } };
  assert.equal(planMilitaryAction(zero, 'DISMISS_SOLDIERS', { count: 1 })?.patch.military.morale, 0);
  assert.equal(planMilitaryAction(zero, 'RECRUIT_SOLDIERS', { count: 1, soldierType: 'knights' })?.patch.military.morale, 5);
  assert.equal(planMilitaryAction(zero, 'UPGRADE_FORTIFICATION', { track: 'walls' })?.patch.military.morale, 10);
});
