import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { nextCompanionContent } from '../../src/engine/tavernCompanion.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { calculateDefenseRating } from '../../src/data/military.js';
import seasonalEventData from '../../src/data/seasonalEvents.js';

test('Marta and Aldric cannot resolve an offer that was never displayed', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_MARTA_ACCEPT_OFFER', payload: { offerId: 'storage_deal' },
  }), started);
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_ALDRIC_ACCEPT_OFFER', payload: { offerId: 'war_story_lesson' },
  }), started);
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_MARTA_DECLINE_OFFER', payload: { offerId: 'forged_offer' },
  }), started);
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_ALDRIC_DECLINE_OFFER', payload: { offerId: 'forged_offer' },
  }), started);
});

test('seeded pending offers settle once under the displayed authored terms', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 4 } });
  const visited = gameReducer(started, { type: 'TAVERN_VISIT' });
  const marta = gameReducer(visited, { type: 'TAVERN_MARTA_NEXT' });
  assert.deepEqual(marta.tavern.martaCurrentContent,
    { type: 'offer', offerId: 'storage_deal', resolution: null });
  assert.strictEqual(gameReducer(marta, { type: 'TAVERN_MARTA_NEXT' }), marta);
  assert.strictEqual(gameReducer(marta, {
    type: 'TAVERN_MARTA_ACCEPT_OFFER', payload: { offerId: 'spice_investment' },
  }), marta);
  assert.equal(readV2Save(writeV2Save(marta)).ok, true);
  const accepted = gameReducer(marta, {
    type: 'TAVERN_MARTA_ACCEPT_OFFER', payload: { offerId: 'storage_deal', cost: -1_000_000 },
  });
  assert.equal(accepted.denarii, 650);
  assert.equal(accepted.inventoryCapacity, 320);
  assert.deepEqual(accepted.tavern.martaCurrentContent,
    { type: 'offer', offerId: 'storage_deal', resolution: 'accepted' });
  assert.deepEqual(accepted.tavern.martaOffersUsed, ['storage_deal']);
  assert.strictEqual(gameReducer(accepted, {
    type: 'TAVERN_MARTA_ACCEPT_OFFER', payload: { offerId: 'storage_deal' },
  }), accepted);
  assert.equal(readV2Save(writeV2Save(accepted)).ok, true);
  const declined = gameReducer(marta, {
    type: 'TAVERN_MARTA_DECLINE_OFFER', payload: { offerId: 'storage_deal' },
  });
  assert.equal(declined.denarii, 700);
  assert.deepEqual(declined.tavern.martaCurrentContent,
    { type: 'offer', offerId: 'storage_deal', resolution: 'declined' });
  assert.strictEqual(gameReducer(declined, {
    type: 'TAVERN_MARTA_ACCEPT_OFFER', payload: { offerId: 'storage_deal' },
  }), declined);

  const aldric = gameReducer(visited, { type: 'TAVERN_ALDRIC_NEXT' });
  assert.deepEqual(aldric.tavern.aldricCurrentContent,
    { type: 'offer', offerId: 'war_story_lesson', resolution: null });
  assert.strictEqual(gameReducer(aldric, { type: 'TAVERN_ALDRIC_NEXT' }), aldric);
  const lesson = gameReducer(aldric, {
    type: 'TAVERN_ALDRIC_ACCEPT_OFFER', payload: { offerId: 'war_story_lesson' },
  });
  assert.equal(lesson.population, 24);
  assert.equal(lesson.denarii, 700);
  assert.deepEqual(lesson.tavern.aldricCurrentContent,
    { type: 'offer', offerId: 'war_story_lesson', resolution: 'accepted' });
  assert.strictEqual(gameReducer(lesson, {
    type: 'TAVERN_ALDRIC_ACCEPT_OFFER', payload: { offerId: 'war_story_lesson' },
  }), lesson);
  assert.equal(readV2Save(writeV2Save(lesson)).ok, true);
});

test('companion advice and stories cycle without repeats and reject invalid draws', () => {
  for (const [kind, roll] of [['marta', 0.5], ['aldric', 0.9]] as const) {
    let advice: number[] = [];
    let stories: number[] = [];
    const seen = new Set<number>();
    const count = roll === 0.5 ? 10 : 8;
    for (let index = 0; index < count; index++) {
      const draws = [roll, 0];
      const next = nextCompanionContent(kind, () => draws.shift() ?? NaN, [], advice, stories);
      assert.ok(next);
      assert.equal(next.content.type, roll === 0.5 ? 'advice' : 'story');
      if (next.content.type === 'advice' || next.content.type === 'story') seen.add(next.content.index);
      advice = next.adviceRemaining;
      stories = next.storiesRemaining;
    }
    assert.equal(seen.size, count);
  }
  assert.throws(() => nextCompanionContent('marta', () => NaN, [], [], []), RangeError);
});

test('invalid companion offer histories and pending content cannot load', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 4 } });
  const pending = gameReducer(gameReducer(started, { type: 'TAVERN_VISIT' }), { type: 'TAVERN_MARTA_NEXT' });
  const envelope = JSON.parse(writeV2Save(pending));
  for (const damage of ['unknown-offer', 'unknown-pending', 'unrecorded-resolution', 'bad-queue', 'wrong-owner']) {
    const damaged = structuredClone(envelope);
    if (damage === 'unknown-offer') damaged.state.tavern.martaOffersUsed = ['forged_offer'];
    if (damage === 'unknown-pending') damaged.state.tavern.martaCurrentContent.offerId = 'forged_offer';
    if (damage === 'unrecorded-resolution') damaged.state.tavern.martaCurrentContent.resolution = 'accepted';
    if (damage === 'bad-queue') damaged.state.tavern.martaAdviceRemaining = [99];
    if (damage === 'wrong-owner') {
      damaged.state.tavern.aldricCurrentContent = { type: 'offer', offerId: 'storage_deal', resolution: null };
    }
    assert.equal(readV2Save(JSON.stringify(damaged)).ok, false);
  }
  const older = structuredClone(envelope);
  for (const kind of ['marta', 'aldric']) {
    delete older.state.tavern[`${kind}CurrentContent`];
    delete older.state.tavern[`${kind}AdviceRemaining`];
    delete older.state.tavern[`${kind}StoriesRemaining`];
    delete older.state.tavern[`${kind}ScribesNoteSeen`];
  }
  assert.equal(readV2Save(JSON.stringify(older)).ok, true);
  for (const kind of ['marta', 'aldric']) {
    const damaged = structuredClone(envelope);
    damaged.state.tavern[`${kind}ScribesNoteSeen`] = 'yes';
    assert.equal(readV2Save(JSON.stringify(damaged)).ok, false);
  }
});

test('Aldric drill changes a raid defense rating after its fee is paid', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 2 } });
  const offered = gameReducer(gameReducer(started, { type: 'TAVERN_VISIT' }), { type: 'TAVERN_ALDRIC_NEXT' });
  assert.equal(offered.tavern.aldricCurrentContent?.offerId, 'basic_drill');
  const drilled = gameReducer(offered, {
    type: 'TAVERN_ALDRIC_ACCEPT_OFFER', payload: { offerId: 'basic_drill' },
  });
  assert.equal(drilled.denarii, offered.denarii - 30);
  assert.equal(drilled.tavern.aldricDrillActive, 3);
  const warning = {
    ...drilled,
    phase: 'raid_warning',
    raids: { ...drilled.raids, activeRaid: { type: 'criminal', phase: 'warning', result: null } },
  };
  const defended = gameReducer(warning, { type: 'RAID_DEFEND' });
  assert.equal(defended.raids.activeRaid.defenseRating,
    calculateDefenseRating(drilled.military) + drilled.garrison);
  assert.equal(defended.raids.activeRaid.drillBonus, drilled.garrison);
  const thirdSeason = {
    ...drilled, turn: 16, season: 'winter', year: 4,
    tavern: { ...drilled.tavern, aldricDrillActive: 1 },
  };
  const simulated = gameReducer(thirdSeason, {
    type: 'SIMULATE_SEASON', payload: { seasonalEvents: Object.values(seasonalEventData).flat() },
  });
  assert.equal(simulated.phase, 'raid_warning');
  assert.equal(simulated.tavern.aldricDrillActive, 0);
  assert.equal(simulated.raids.activeRaid.drillBonus, simulated.garrison);
  assert.equal(readV2Save(writeV2Save(simulated)).ok, true);
  const forgedWarning = JSON.parse(writeV2Save(simulated));
  forgedWarning.state.raids.activeRaid.drillBonus = simulated.garrison + 1;
  assert.equal(readV2Save(JSON.stringify(forgedWarning)).ok, false);
  const lastCoveredRaid = gameReducer(simulated, { type: 'RAID_DEFEND' });
  assert.equal(lastCoveredRaid.raids.activeRaid.defenseRating,
    calculateDefenseRating(simulated.military) + simulated.garrison);
});

test('Aldric referral obeys total, type, and population recruitment limits', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 49 } });
  const offered = gameReducer(gameReducer(started, { type: 'TAVERN_VISIT' }), { type: 'TAVERN_ALDRIC_NEXT' });
  assert.equal(offered.tavern.aldricCurrentContent?.offerId, 'recruit_referral');
  const accept = (state: typeof offered) => gameReducer(state, {
    type: 'TAVERN_ALDRIC_ACCEPT_OFFER', payload: { offerId: 'recruit_referral' },
  });
  const cappedTotal = {
    ...offered, population: 60, garrison: 25,
    military: { ...offered.military, garrison: { levy: 16, menAtArms: 9, knights: 0 } },
  };
  assert.strictEqual(accept(cappedTotal), cappedTotal);
  const cappedType = {
    ...offered, population: 60, garrison: 20,
    military: { ...offered.military, garrison: { levy: 10, menAtArms: 10, knights: 0 } },
  };
  assert.strictEqual(accept(cappedType), cappedType);
  const cappedPopulation = {
    ...offered, population: 20, garrison: 12,
    military: { ...offered.military, garrison: { levy: 11, menAtArms: 1, knights: 0 } },
  };
  assert.strictEqual(accept(cappedPopulation), cappedPopulation);
  assert.strictEqual(gameReducer(cappedTotal, {
    type: 'RECRUIT_SOLDIERS', payload: { count: 1, soldierType: 'levy' },
  }), cappedTotal);
  const room = {
    ...offered, population: 30, garrison: 9,
    military: { ...offered.military, garrison: { levy: 5, menAtArms: 4, knights: 0 } },
  };
  const recruited = accept(room);
  assert.equal(recruited.garrison, 10);
  assert.equal(recruited.military.garrison.menAtArms, 5);
  assert.equal(recruited.denarii, room.denarii - 40);
  assert.equal(readV2Save(writeV2Save(recruited)).ok, true);
});
