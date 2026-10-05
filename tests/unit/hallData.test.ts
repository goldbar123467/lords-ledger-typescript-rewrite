import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as hall from '../../src/data/greatHall.ts';

const state = (treasury = 50, season = 'summer') => ({ season, greatHall: { meters: { people: 50, treasury, church: 50, military: 50 } } });

test('shared Hall authored static exports retain all content and stable registry identities', () => {
  const staticExports = Object.fromEntries(Object.entries(hall).filter(([, value]) => typeof value !== 'function'));
  assert.equal(createHash('sha256').update(JSON.stringify(staticExports)).digest('hex'), 'e6eb92bb5a645a18b9bd4a2145cb0736baab848a73bc9972ed0727e1b374dd71');
  assert.equal(hall.AMBIENT_TEXTS.length, 12); assert.equal(Object.values(hall.EDMUND_DIALOGUE).flat().length, 55);
  assert.equal(Object.keys(hall.EDMUND_DIALOGUE).length, 10); assert.equal(hall.COMPOUND_RULES.length, 6);
  assert.equal(Object.keys(hall.CRISIS_EVENTS).length, 4); assert.equal(Object.keys(hall.PEAK_EVENTS).length, 4);
});

test('reputation preserves empty histories, score thresholds, mixed balance and tie ordering', () => {
  assert.deepEqual(hall.computeReputation(null), { track: null, title: 'Unknown Lord', scores: {} });
  const mixed = hall.computeReputation([{ consequences: { people: 2, treasury: -2 } }]);
  assert.equal(mixed.track, 'balanced'); assert.equal(mixed.scores.balanced, 2);
  const tied = hall.computeReputation([{ consequences: { people: 4, treasury: 4 } }]);
  assert.equal(tied.track, 'merciful'); assert.equal(tied.title, 'Gentle Hand');
  assert.equal(hall.computeReputation([{ consequences: { military: 15 } }]).title, 'Conqueror');
  assert.equal(hall.computeReputation([{ consequences: null }]).title, 'Fledgling Judge');
});

test('all six compound predicates retain authored identities and threshold combinations', () => {
  const history = [
    { disputeId: 'giles_poacher', consequences: { people: -4 } },
    { disputeId: 'edwin_tinker', consequences: { treasury: -1, people: -4 } },
    { disputeId: 'henrik_trader', consequences: { treasury: 1, people: -4 } },
    { disputeId: 'brother_marcus', consequences: { church: 1, people: 4 } },
    { consequences: { people: 4 } }, { consequences: { people: 4 } },
  ];
  assert.deepEqual(hall.computeCompoundFlags(history), { harshOnPoacher: true, fundedEdwin: true, welcomedHenrik: true, grantedScriptorium: true, mercifulToThieves: true, ironRule: true });
  assert.deepEqual(hall.computeCompoundFlags(null), {});
});

test('dialogue retains priority and cosmetic draw selection without changing state', () => {
  const random = Math.random;
  try {
    Math.random = () => 0;
    const ordinary = state(), before = structuredClone(ordinary);
    assert.equal(hall.selectEdmundLine(ordinary, 'throne', 50), hall.EDMUND_DIALOGUE.season[1]?.text);
    assert.equal(hall.selectEdmundLine(state(0, 'winter'), 'audience', 0), hall.EDMUND_DIALOGUE.crisis[0]?.text);
    assert.deepEqual(ordinary, before);
  } finally { Math.random = random; }
});

test('trust, mood and pitch compatibility retain existing boundary behavior', () => {
  for (const [trust, label] of [[0, 'Wary'], [30, 'Wary'], [31, 'Cautious'], [51, 'Respectful'], [71, 'Devoted'], [86, 'Bonded'], [100, 'Bonded'], [50.5, 'Wary']] as const) assert.equal(hall.getTrustTier(trust).label, label);
  assert.equal(hall.getEdmundMood(19.5).label, 'Worried'); assert.equal(hall.getEdmundMood(20).label, 'Concerned');
  const pitch = hall.exportPitchData({ greatHall: { stewardTrust: 0, audienceResolved: ['aud_001'], rulingHistory: [{ consequences: { people: 3 } }] } });
  assert.equal(pitch.totalAudienceHeld, 1); assert.equal(pitch.rulingDistribution.merciful, 1);
  // Characterize the existing truthy default here; correction is a separate reviewable section.
  assert.equal(pitch.stewardTrust, 50);
});
