import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PERSPECTIVE_FLIPS } from '../../src/data/perspectiveFlips.ts';
import { CYOA_FLIPS } from '../../src/data/cyoaFlips.ts';
import type { CyoaFlip, FlipOption } from '../../src/data/flipTypes.ts';
import { ALL_FLIPS, checkFlipTriggers, computeFlipConsequences, getInitialFlipStats,
  isFlipId, resolveFlipOption } from '../../src/engine/flipEngine.ts';

test('all nine authored stories preserve their complete content and references', () => {
  const content = JSON.stringify({ PERSPECTIVE_FLIPS, CYOA_FLIPS });
  assert.equal(createHash('sha256').update(content).digest('hex').toUpperCase(),
    '9DBE64D5FC380E2D9D1256D0D6B306613E732EF590A9D3E7136E171127D399D9');
  assert.equal(Object.keys(ALL_FLIPS).length, 9);
  let decisions = 0;
  let options = 0;
  let nodes = 0;
  // The original monk registry explicitly reserves this unused ending for future extension.
  const reservedNodes: Record<string, readonly string[]> = { cyoa_monk: ['ENDING_T_BAD'] };
  for (const [id, flip] of Object.entries(ALL_FLIPS)) {
    assert.equal(flip.id, id);
    if (flip.type === 'cyoa') {
      nodes += Object.keys(flip.nodes).length;
      const visited = new Set<string>();
      const visit = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        const node = flip.nodes[nodeId];
        assert.ok(node, `${id}: missing node ${nodeId}`);
        visited.add(nodeId);
        if (node.isEnding) assert.ok(flip.consequences[node.endingType]);
        else for (const option of node.options) visit(option.goto);
      };
      visit(flip.startNode);
      assert.deepEqual(Object.keys(flip.nodes).filter(nodeId => !visited.has(nodeId)),
        reservedNodes[id] ?? [], `${id}: unexpected unreachable authored nodes`);
    } else {
      decisions += flip.decisions.length;
      for (const decision of flip.decisions) {
        options += decision.options.length;
        for (const option of decision.options) {
          const effects = option.chance === undefined
            ? [option.statEffects] : [option.successStatEffects, option.failureStatEffects];
          for (const effect of effects) for (const stat of Object.keys(effect)) {
            assert.ok(Object.hasOwn(flip.characterStats, stat), `${id}: unknown character stat ${stat}`);
          }
        }
      }
    }
  }
  assert.deepEqual([decisions, options, nodes], [17, 51, 55]);
});

test('flip priority, cooldown, and completed-story guards use the authored triggers', () => {
  assert.equal(checkFlipTriggers({ turn: 8, taxRate: 'high', denarii: 500 }), 'serf_week');
  assert.equal(checkFlipTriggers({ turn: 8, taxRate: 'high', denarii: 500, lastFlipTurn: 6 }), null);
  assert.equal(checkFlipTriggers({ turn: 8, taxRate: 'high', tradeCount: 5,
    perspectiveFlips: { serf_week: true } }), 'merchant_day');
  assert.equal(checkFlipTriggers({ turn: 4, denarii: 500 }), null);
  assert.equal(checkFlipTriggers({ turn: 5, denarii: 300 }), 'cyoa_lord');
  assert.equal(checkFlipTriggers({ turn: 5, denarii: 299 }), null);
  assert.equal(isFlipId('invented'), false);
  assert.equal(isFlipId('constructor'), false);
  assert.deepEqual(getInitialFlipStats('invented'), {});
});

test('choice resolution preserves clamp, exact chance boundary, flags, and draw count', () => {
  const current = { energy: 90, hunger: 2 };
  const chance: FlipOption = { text: 'Test choice', chance: 0.25,
    successStatEffects: { energy: 20 }, failureStatEffects: { hunger: -10 },
    successOutcome: 'success', failureOutcome: 'failure',
    consequenceFlags: { success: ['won'], failure: ['lost'] } };
  let draws = 0;
  assert.deepEqual(resolveFlipOption(chance, current, () => { draws++; return 0.249; }), {
    nextStats: { energy: 100, hunger: 2 }, consequenceFlags: ['won'], outcome: 'success', wasSuccess: true,
  });
  assert.deepEqual(resolveFlipOption(chance, current, () => { draws++; return 0.25; }), {
    nextStats: { energy: 90, hunger: 0 }, consequenceFlags: ['lost'], outcome: 'failure', wasSuccess: false,
  });
  assert.equal(draws, 2);
  assert.deepEqual(current, { energy: 90, hunger: 2 });
  assert.deepEqual(resolveFlipOption({ text: 'Certain', statEffects: { energy: -5 }, outcome: 'done' }, current,
    () => { throw new Error('A deterministic choice must not draw randomness'); }).nextStats,
  { energy: 85, hunger: 2 });
});

test('consequence flags contribute once and unsupported flags do not alter the base', () => {
  assert.deepEqual(computeFlipConsequences('serf_week',
    ['obedient_labor', 'obedient_labor', 'missed_labor', 'invented']), { people: 1, treasury: 0 });
});

// These type-level checks fail compilation if the authored unions become permissive.
type AssertNever<T extends never> = T;
export type EndingContractCheck = AssertNever<Extract<'invented', keyof CyoaFlip['consequences']>>;
export type ChoiceContractCheck = AssertNever<Extract<{ text: string; chance: number }, FlipOption>>;
