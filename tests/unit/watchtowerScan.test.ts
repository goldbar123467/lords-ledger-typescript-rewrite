import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomCursor } from '../../src/engine/random.ts';
import { createScanPlan, summarizeScan } from '../../src/engine/watchtowerScan.ts';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('the same saved stream yields the same visible scan with reachable top rating', () => {
  const counts = new Set<number>();
  for (let seed = 0; seed < 50; seed++) {
    const first = createScanPlan(createRandomCursor(seed).next);
    const replay = createScanPlan(createRandomCursor(seed).next);
    assert.deepEqual(first, replay);
    const ids = first.anomalies.map(anomaly => anomaly.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(first.anomalies.some(anomaly => anomaly.category === 'threat'));
    assert.ok(first.anomalies.some(anomaly => anomaly.category !== 'threat'));
    counts.add(ids.length);
    const perfect = summarizeScan(first, first.anomalies.map(anomaly => anomaly.key));
    assert.ok(perfect);
    if (ids.length === 5) {
      assert.equal(perfect.rating.label, 'Eagle-eyed');
      assert.equal(perfect.rating.denariiBonus, 10);
    }
  }
  assert.deepEqual([...counts].sort(), [4, 5]);
});

test('seeded scan lanes keep every pointer target separate at narrow widths', () => {
  for (const seed of [2227729493, ...Array.from({ length: 100 }, (_, index) => index)]) {
    const { anomalies } = createScanPlan(createRandomCursor(seed).next);
    for (let first = 0; first < anomalies.length; first++) {
      for (let second = first + 1; second < anomalies.length; second++) {
        const left = anomalies[first];
        const right = anomalies[second];
        assert.ok(left && right);
        assert.ok(Math.abs(left.x - right.x) * 3.2 > 40,
          `Seed ${seed} places ${left.id} and ${right.id} too close in a 320px landscape`);
      }
    }
  }
});

test('scan rewards are derived once from its saved seed and valid found keys', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { seed: 21 } });
  const plan = createScanPlan(createRandomCursor(started.rngState).next);
  const foundKeys = plan.anomalies.map(anomaly => anomaly.key);
  const report = summarizeScan(plan, foundKeys);
  assert.ok(report);
  const action = { type: 'WATCHTOWER_SCAN_COMPLETE', payload: { scanSeed: started.rngState, foundKeys } };
  const completed = gameReducer(started, action);
  assert.equal(completed.watchtower.scannedThisSeason, true);
  assert.equal(completed.watchtower.lastScanResult.anomaliesFound, plan.anomalies.length);
  assert.equal(completed.denarii, started.denarii + report.rating.denariiBonus);
  assert.deepEqual(completed.watchtower.warnings, report.warnings);
  assert.notEqual(completed.rngState, started.rngState);
  assert.strictEqual(gameReducer(completed, action), completed, 'repeated reward must be ignored');
  assert.strictEqual(gameReducer(initialState, { ...action, payload: { ...action.payload, scanSeed: initialState.rngState } }), initialState);

  const fabricated = { type: 'WATCHTOWER_SCAN_COMPLETE', payload: {
    scanSeed: started.rngState, foundKeys: ['fabricated'], denariiBonus: 1_000_000,
  } };
  assert.strictEqual(gameReducer(started, fabricated), started);
  assert.strictEqual(gameReducer(started, { ...action, payload: { ...action.payload, foundKeys: [foundKeys[0], foundKeys[0]] } }), started);
  const saved = readV2Save(writeV2Save(completed));
  assert.equal(saved.ok, true);
  if (saved.ok) assert.deepEqual(saved.state, JSON.parse(JSON.stringify(completed)));
});
