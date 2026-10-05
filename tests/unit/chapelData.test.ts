import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as chapel from '../../src/data/chapel.ts';

test('complete authored Chapel exports remain identical to the archived rewrite checkpoint', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(chapel)).digest('hex'),
    'e226aa7c887d714206322468b9704f97225e707028c1b32f517d08ecdcb0263d');
  // JSON renders Infinity as null; check the authored terminal threshold directly.
  assert.equal(chapel.PIETY_FLAVOR.at(-1)?.max, Infinity);
});
