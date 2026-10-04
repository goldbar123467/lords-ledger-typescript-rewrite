import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as raids from '../../src/data/raids.ts';

test('raid registry preserves the authored pre-rewrite content and trade goods', () => {
  assert.equal(
    createHash('sha256').update(JSON.stringify(raids)).digest('hex'),
    'e3a186f232faed5dc987d1d7dc5e6abf288806493b424e211361aacf661f882d',
  );
});
