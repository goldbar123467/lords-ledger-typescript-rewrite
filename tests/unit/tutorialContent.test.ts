import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUTORIALS } from '../../src/data/tutorials.ts';
import { HINTS } from '../../src/data/tutorialHints.ts';
import { TAB_CONFIG } from '../../src/data/tabs.ts';

test('all original tutorial guidance, hint thresholds and navigation labels remain intact', () => {
  const content = { tutorials: TUTORIALS, hints: HINTS, tabs: TAB_CONFIG };
  assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'),
    '3c93ffd65716e56db4111711e24f2f7d0e478fed3005285da16481c6a9bc9d95');
  assert.deepEqual(Object.keys(TUTORIALS), TAB_CONFIG.map(tab => tab.id));
  assert.equal(Object.values(TUTORIALS).reduce((sum, tutorial) => sum + tutorial.sections.length, 0), 31);
  assert.equal(Object.values(HINTS).flat().length, 9);
});
