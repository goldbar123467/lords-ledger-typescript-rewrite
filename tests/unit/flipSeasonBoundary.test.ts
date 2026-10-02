import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, gameReducer } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

for (const [taxRate, flipId] of [['high', 'serf_week'], ['medium', 'cyoa_lord']] as const) {
  test(`${flipId} applies seasonal work once across saved story continuation`, () => {
    const started = gameReducer(createInitialState(17),
      { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
    // Characterization fixture at a real boundary, followed only by production commands.
    const boundary = { ...started, turn: 7, season: 'autumn', year: 2, taxRate,
      tavern: { ...started.tavern, gambitRoundsThisSeason: 3, ratsPlayedThisSeason: true },
      watchtower: { ...started.watchtower, scannedThisSeason: true },
      blacksmith: { ...started.blacksmith, salesThisSeason: 2 },
    };
    const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const entered = gameReducer(simulated, { type: 'ADVANCE_TURN' });
    assert.equal(entered.phase, 'flip_intro');
    assert.equal(entered.currentFlipId, flipId);
    assert.equal(entered.greatHall.stewardTrust, 48);
    assert.deepEqual(entered.greatHall.meterHistory.map((entry: { turn: number }) => entry.turn), [7]);
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
