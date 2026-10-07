import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyQaSource, summarizeQaFindings, type QaFinding} from '../e2e/qaDiagnostics.ts';

test('QA origin attribution distinguishes local, cross-origin and unknown locations without filtering messages', () => {
  const app = 'http://example.test:5182/';
  assert.equal(classifyQaSource('http://example.test:5182/assets/game.js', app), 'application');
  assert.equal(classifyQaSource('http://example.test:5183/assets/game.js', app), 'external');
  assert.equal(classifyQaSource('https://fonts.example.test/font.woff2', app), 'external');
  assert.equal(classifyQaSource('', app), 'unknown');
  assert.equal(classifyQaSource('blob:http://example.test:5182/123', app), 'unknown');
  assert.equal(classifyQaSource('http://example.test:5182/', 'about:blank'), 'unknown');
});

test('QA summary counts failed attempts and error observations, including network and artifact categories', () => {
  const finding: QaFinding = {ts: new Date(0).toISOString(), persona: 'Avg', status: 'failed', expectedCancellations: [],
    errors: [{type: 'pageerror', msg: 'net::ERR_APPLICATION', source: 'unknown'},
      {type: 'request', msg: 'net::ERR_CONNECTION_REFUSED', source: 'application'},
      {type: 'response', msg: 'HTTP 503', source: 'external', status: 503},
      {type: 'artifact', msg: 'Screenshot closed', source: 'unknown'}],
    bugs: [{persona: 'Avg', turn: 3, note: 'blocked', reason: 'loop_timeout', iteration: 120, innerText: null, buttonLabels: []}]};
  const summary = summarizeQaFindings([finding], 1000, 1501);
  assert.equal(summary.durationMs, 501); assert.equal(summary.failedAttempts, 1);
  assert.equal(summary.totalFindings, 1); assert.equal(summary.totalBugs, 1);
  assert.deepEqual(summary.bySeverity, {pageerror: 1, console: 0, request: 1, response: 1, driver: 0, artifact: 1});
  assert.deepEqual(summary.byPersona, {Avg: 1});
  assert.match(summary.countMeaning, /not distinct defects/);
  assert.equal(summarizeQaFindings([{...finding, status: 'running'}], 1000, 1501).incompleteAttempts, 1);
});
