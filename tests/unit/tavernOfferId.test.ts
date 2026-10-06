import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompanionOfferId } from '../../src/engine/tavernCompanion.ts';
import { MARTA_OFFERS, ALDRIC_TRAINING_OFFERS } from '../../src/data/tavern.ts';

test('single offer callback guard recognizes every authored ID only for its companion', () => {
  for (const offer of MARTA_OFFERS) {
    assert.equal(isCompanionOfferId('marta', offer.id), true);
    assert.equal(isCompanionOfferId('aldric', offer.id), false);
  }
  for (const offer of ALDRIC_TRAINING_OFFERS) {
    assert.equal(isCompanionOfferId('aldric', offer.id), true);
    assert.equal(isCompanionOfferId('marta', offer.id), false);
  }
  for (const value of [undefined, null, '', 'toString', '__proto__', 1, {}, []]) {
    assert.equal(isCompanionOfferId('marta', value), false);
    assert.equal(isCompanionOfferId('aldric', value), false);
  }
});
