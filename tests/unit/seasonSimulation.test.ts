import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {gameReducer} from '../../src/engine/gameReducer.ts';
import seasonal from '../../src/data/seasonalEvents.ts';
import {readV2Save, writeV2Save} from '../../src/save/saveGame.ts';
import {seasonSimulationFixtures} from '../fixtures/seasonSimulation.ts';

test('season orchestration preserves terminal, raid, timed-effect and morale ordering', () => {
  // Frozen from the actual 2420d22 reducer and compared with the extracted owner.
  const hash = createHash('sha256');
  const action = {type: 'SIMULATE_SEASON', payload: {seasonalEvents: Object.values(seasonal).flat()}} as const;
  const phases: Record<string, number> = {};
  let cases = 0;
  for (const {label, state} of seasonSimulationFixtures()) {
    const before = writeV2Save(state);
    const next = gameReducer(state, action);
    assert.equal(writeV2Save(state), before, `${label}: input remains unchanged`);
    const loaded = readV2Save(before);
    if (!loaded.ok) throw new Error(loaded.error);
    assert.deepEqual(gameReducer(loaded.state, action), next, `${label}: saved cursor replay`);
    hash.update(JSON.stringify(next) + '\n' + writeV2Save(next) + '\n');
    phases[next.phase] = (phases[next.phase] ?? 0) + 1;
    cases++;
  }
  assert.equal(cases, 180);
  assert.deepEqual(phases, {seasonal_action: 60, raid_warning: 60, victory: 36, game_over: 24});
  assert.equal(hash.digest('hex'), '7816dd3cbb04e8013d9606313068b5a16df72424d75cf8b188c6fc839f6b4e51');
});
