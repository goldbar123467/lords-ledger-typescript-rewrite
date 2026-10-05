import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as chapel from '../../src/data/chapel.ts';

test('authored Chapel exports preserve the checkpoint except two verified claim corrections', () => {
  const inventory = structuredClone({ ...chapel });
  const herbs = inventory.SHOP_ITEMS.find(item => item.id === 'monastery_herbs');
  const bishop = inventory.MORAL_DILEMMAS.find(dilemma => dilemma.id === 'bishops_demand');
  assert.ok(herbs && bishop);
  // Restore only the two intentionally corrected claims for complete baseline comparison.
  // chapelClaims.test.ts independently requires their truthful replacement text and unchanged effects.
  herbs.effectText = 'Heals 5 pop during plague events';
  bishop.narrative = bishop.narrative.replace('60 denarii', '10% of your treasury');
  assert.equal(createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
    'e226aa7c887d714206322468b9704f97225e707028c1b32f517d08ecdcb0263d');
  // JSON renders Infinity as null; check the authored terminal threshold directly.
  assert.equal(chapel.PIETY_FLAVOR.at(-1)?.max, Infinity);
});
