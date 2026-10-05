import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import disputes from '../../src/data/disputes.ts';

test('all authored dispute content retains the baseline hash and 51 distinct ruling branches', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(disputes)).digest('hex'),'9e7b17d2e21f833429cb35bf33eb6f102ebc5cdcf4589dcadfa6f6b446e7d2b2');
  assert.equal(disputes.length,16);assert.equal(new Set(disputes.map(d=>d.id)).size,16);
  assert.equal(disputes.reduce((sum,d)=>sum+d.rulings.length,0),51);
  for(const dispute of disputes) {
    assert.equal(new Set(dispute.rulings.map(r=>r.id)).size,dispute.rulings.length);
    for(const ruling of dispute.rulings)assert.deepEqual(Object.keys(ruling.consequences).sort(),['church','military','people','treasury']);
  }
});

test('the solo decision retains its description while other disputes retain both petitioners', () => {
  const decision=disputes.find(d=>d.id==='dispute_015');if(!decision)throw new Error('Missing authored decision');
  assert.equal(decision.petitionerA,null);assert.equal(decision.petitionerB,null);assert.ok(decision.description);
  for(const dispute of disputes.filter(d=>d.id!=='dispute_015'))assert.ok(dispute.petitionerA && dispute.petitionerB);
});
