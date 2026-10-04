import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as watchtower from '../../src/data/watchtower.ts';
import type { ScanAnomaly } from '../../src/engine/watchtowerScan.ts';

type Assert<T extends true> = T;
export type CheckedAnomalyId = Assert<ScanAnomaly['id'] extends watchtower.AnomalyId ? true : false>;

test('Watchtower authored pools, trader identities and scan tuning remain intact', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(watchtower)).digest('hex'),
    '9d61e1dfdeb5046ddde19e52cc2f61793ff76b92d52daf2d10a97e0cccfd178c');
  assert.deepEqual(watchtower.ANOMALY_TYPES.map(anomaly => anomaly.id), ['campfire', 'dust', 'signal', 'wagon', 'birds']);
  assert.equal(watchtower.WATCHTOWER_SUBTITLES.length, 8);
  assert.equal(watchtower.RODERIC_HISTORICAL_LESSONS.length, 10);
  assert.equal(watchtower.RODERIC_DEFENSE_ASSESSMENTS.length, 5);
  assert.equal(watchtower.RODERIC_STRATEGIC_TIPS.length, 6);
  assert.equal(watchtower.FOREIGN_TRADERS.length, 5);
  assert.deepEqual(watchtower.SCAN_RATINGS.map(rating => [rating.min, rating.max, rating.denariiBonus]),
    [[0, 1, 0], [2, 3, 0], [4, 4, 5], [5, 99, 10]]);
});

test('conditional captain dialogue safely omits unavailable raid and warning branches', () => {
  for (const index of [2, 3, 4]) {
    const response = watchtower.RODERIC_DEFENSE_ASSESSMENTS[index];
    assert.ok(response);
    assert.equal(response({ turn: 1 }), null);
  }
  const scouting = watchtower.RODERIC_DEFENSE_ASSESSMENTS[4];
  assert.ok(scouting);
  assert.match(scouting({ turn: 1, watchtower: { warnings: { criminalRaidBonus: 2 } } }) ?? '', /scouting paid off/);
});
