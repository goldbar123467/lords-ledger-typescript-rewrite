import {present} from '../gameInput.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../src/engine/gameReducer.ts';
import { rawGameReducer as gameReducer } from '../gameInput.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { ALL_FLIPS } from '../../src/engine/flipEngine.ts';

for (const [taxRate, flipId] of [['high', 'serf_week'], ['medium', 'cyoa_lord']] as const) {
  test(`${flipId} applies seasonal work once across saved story continuation`, () => {
    const started = gameReducer(createInitialState(17),
      { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
    // Characterization fixture at a real boundary, followed only by production commands.
    const boundary = { ...started, turn: 7, season: 'autumn' as const, year: 2, taxRate,
      tavern: { ...started.tavern, gambitRoundsThisSeason: 3, ratsPlayedThisSeason: true },
      watchtower: { ...started.watchtower, scannedThisSeason: true },
      blacksmith: { ...started.blacksmith, salesThisSeason: 2 },
    };
    const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const entered = gameReducer(simulated, { type: 'ADVANCE_TURN' });
    assert.equal(entered.phase, 'flip_intro');
    assert.equal(entered.currentFlipId, flipId);
    assert.equal(entered.greatHall.stewardTrust, 48);
    assert.deepEqual(present(entered.greatHall.meterHistory, "entered.greatHall.meterHistory").map((entry: { turn: number }) => entry.turn), [7]);
    assert.equal(entered.tavern.gambitRoundsThisSeason, 0);
    assert.equal(entered.tavern.ratsPlayedThisSeason, false);
    assert.equal(entered.watchtower.scannedThisSeason, false);
    assert.equal(entered.blacksmith.salesThisSeason, 0);
    let current = gameReducer(entered, { type: 'DISMISS_FLIP_INTRO' });
    for (let i = 0; i < 32 && current.phase !== 'flip_summary'; i++) {
      if (current.phase === 'flip_decision') {
        current = gameReducer(current, { type: 'SELECT_FLIP_OPTION', payload: { optionIndex: 0 } });
      } else {
        assert.equal(current.phase, 'flip_outcome');
        current = gameReducer(current, { type: 'CONTINUE_FLIP' });
      }
    }
    assert.equal(current.phase, 'flip_summary');
    const loaded = readV2Save(writeV2Save(current));
    if (!loaded.ok) throw new Error(loaded.error);
    const saved = loaded.state;
    assert.equal(writeV2Save(saved), writeV2Save(current), 'save/load preserves the complete fixture');
    const untouched = structuredClone(saved);
    const after = gameReducer(saved, { type: 'DISMISS_FLIP_SUMMARY' });
    assert.equal(after.phase, 'management');
    assert.equal(after.turn, 8);
    assert.deepEqual(after.greatHall, saved.greatHall, 'returning does not decay trust or snapshot history again');
    assert.deepEqual(after.marketPrices, current.marketPrices, 'season quotes survive the story');
    assert.deepEqual(after.market, current.market);
    assert.deepEqual(after.blacksmith, current.blacksmith, 'forge quotes and price history remain coherent');
    assert.deepEqual(after.tavern, saved.tavern);
    assert.deepEqual(after.watchtower, current.watchtower);
    assert.equal(after.rngState, saved.rngState, 'story settlement has no random operation');
    assert.equal(after.perspectiveFlips[flipId], true);
    assert.equal(after.causeChain.length, (current.causeChain?.length ?? 0) + 1);
    assert.equal(after.chronicle.length, current.chronicle.length + 1);
    assert.deepEqual(saved, untouched);
    assert.deepEqual(after, gameReducer(saved, { type: 'DISMISS_FLIP_SUMMARY' }));
    assert.equal(gameReducer(after, { type: 'DISMISS_FLIP_SUMMARY' }), after);
    assert.equal(readV2Save(writeV2Save(after)).ok, true);
  });
}

function knightSummary(options: number[] = [0, 0, 0, 0]) {
  const started = gameReducer(createInitialState(17), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
  const boundary = { ...started, turn: 19, season: 'autumn' as const, year: 5, garrison: 6,
    military: { ...started.military, garrison: { levy: 6, menAtArms: 0, knights: 0 } },
    perspectiveFlips: Object.fromEntries(Object.keys(ALL_FLIPS).filter(id => id !== 'cyoa_knight').map(id => [id, true])),
    raids: { ...started.raids, lastRaidTurn: 19 },
  };
  const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
  let current = gameReducer(simulated, { type: 'ADVANCE_TURN' });
  assert.equal(current.currentFlipId, 'cyoa_knight');
  current = gameReducer(current, { type: 'DISMISS_FLIP_INTRO' });
  for (const optionIndex of options) current = gameReducer(current, { type: 'SELECT_FLIP_OPTION', payload: { optionIndex } });
  assert.equal(current.phase, 'flip_summary');
  return current;
}

test('saved knight endings apply morale with recruits, losses, and a full garrison', () => {
  for (const [options, ending, expectedMorale, expectedGarrison] of [
    [[0, 0, 0, 0], 'good', 70, 7],
    [[0, 0, 0, 1], 'medium', 61, 7],
    [[0, 0, 1, 1], 'bad', 40, 5],
  ] as const) {
    const summary = knightSummary([...options]);
    assert.equal(summary.cyoaEndingType, ending);
    assert.equal(summary.military.morale, 55);
    const loaded = readV2Save(writeV2Save(summary));
    if (!loaded.ok) throw new Error(loaded.error);
    const before = structuredClone(loaded.state);
    const after = gameReducer(loaded.state, { type: 'DISMISS_FLIP_SUMMARY' });
    assert.equal(after.military.morale, expectedMorale, ending);
    assert.equal(after.garrison, expectedGarrison, ending);
    assert.equal(after.military.garrison.levy, expectedGarrison);
    assert.equal(after.rngState, before.rngState);
    assert.deepEqual(loaded.state, before);
    assert.deepEqual(after, gameReducer(before, { type: 'DISMISS_FLIP_SUMMARY' }));
    assert.equal(gameReducer(after, { type: 'DISMISS_FLIP_SUMMARY' }), after);
    assert.equal(readV2Save(writeV2Save(after)).ok, true);
  }
  const summary = knightSummary();
  const full = { ...summary, population: 50, garrison: 25,
    military: { ...summary.military, morale: 98, garrison: { levy: 25, menAtArms: 0, knights: 0 } },
  };
  const capped = gameReducer(full, { type: 'DISMISS_FLIP_SUMMARY' });
  assert.equal(capped.garrison, 25);
  assert.equal(capped.military.morale, 100, 'morale applies even when no recruit fits');
  const bad = knightSummary([0, 0, 1, 1]);
  const exhausted = gameReducer({ ...bad, military: { ...bad.military, morale: 5 } }, { type: 'DISMISS_FLIP_SUMMARY' });
  assert.equal(exhausted.military.morale, 0);
});

test('returning from a saved story does not count an additional bankruptcy season', () => {
  // Twelve working farms fit the 24 plots and make maintenance exceed passive
  // income, keeping the following winter bankrupt without causing famine.
  const summary = { ...knightSummary(), denarii: 0, bankruptcyTurns: 5,
    buildings: Array.from({ length: 12 }, (_, index) => ({
      type: 'strip_farm', instanceId: `bankruptcy-farm-${index}`, condition: 100, builtOnTurn: 1,
    })),
  };
  const loaded = readV2Save(writeV2Save(summary));
  if (!loaded.ok) throw new Error(loaded.error);
  const before = structuredClone(loaded.state);
  const after = gameReducer(loaded.state, { type: 'DISMISS_FLIP_SUMMARY' });
  assert.equal(after.phase, 'management');
  assert.equal(after.turn, 20);
  assert.equal(after.denarii, 0);
  assert.equal(after.bankruptcyTurns, 5);
  assert.equal(after.gameOverReason, null);
  assert.deepEqual(loaded.state, before);
  assert.equal(gameReducer(after, { type: 'DISMISS_FLIP_SUMMARY' }), after);
  assert.equal(readV2Save(writeV2Save(after)).ok, true);
  // A completed season still owns the next count and the six-season end condition.
  const next = gameReducer(after, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
  assert.equal(next.denarii, 0);
  assert.equal(next.bankruptcyTurns, 6);
  assert.equal(next.phase, 'game_over');
  assert.equal(present(next.gameOverReason, "next.gameOverReason").type, 'bankruptcy');
});
