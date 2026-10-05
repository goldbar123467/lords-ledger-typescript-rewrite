import assert from 'node:assert/strict';
import test from 'node:test';
import { MORAL_DILEMMAS, SHOP_ITEMS } from '../../src/data/chapel.ts';

test('Monastery Herbs describe their implemented food gain', () => {
  const herbs = SHOP_ITEMS.find(item => item.id === 'monastery_herbs');
  assert.ok(herbs);
  assert.equal(herbs.effectText, 'Adds 5 food to your stores');
  assert.deepEqual(herbs.effects, { food: 5 });
  assert.equal(herbs.cost, 10);
});

test('Bishop demand names its fixed cost rather than a treasury percentage', () => {
  const bishop = MORAL_DILEMMAS.find(dilemma => dilemma.id === 'bishops_demand');
  assert.ok(bishop);
  assert.match(bishop.narrative, /60 denarii/);
  assert.doesNotMatch(bishop.narrative, /10%/);
  assert.equal(bishop.choices[0].effects.denarii, -60);
  assert.equal(bishop.choices[1]?.effects.denarii, -30);
});
