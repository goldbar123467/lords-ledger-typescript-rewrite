import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {createGameLog, generateReport, PERSONAS} from '../../playwright-playtest.ts';
import {createOutputDirectory, parseBrowserArgs, WORKSPACE} from '../../tools/browserPlaytestOptions.ts';

test('browser parser requires an explicit preview and distinguishes partial limits', () => {
  assert.deepEqual(parseBrowserArgs(['2', 'http://example.test/game', '--turns=3', '--offset=4', '--debug']),
    {games: 2, baseURL: 'http://example.test/game/', turnLimit: 3, offset: 4, debug: true, output: undefined});
  for (const args of [[], ['0', 'http://example.test'], ['1junk', 'http://example.test'],
    ['1', 'file:///tmp'], ['1', 'http://u:p@example.test'], ['1', 'http://example.test/?x=1'],
    ['1', 'http://example.test', '--turns=0'], ['1', 'http://example.test', '--turns=41'],
    ['1', 'http://example.test', '--offset=6'], ['1', 'http://example.test', '--turns=1', '--turns=2'],
    ['1', 'http://example.test', '--debug', '--debug'], ['1', 'http://example.test', '--unknown']]) {
    assert.throws(() => parseBrowserArgs(args));
  }
});

test('browser output rejects protected paths and existing evidence', () => {
  for (const path of ['report.md', 'playtest-screenshots', 'artifacts/v2', WORKSPACE, 'artifacts/v2/../../README.md']) {
    assert.throws(() => createOutputDirectory(path));
  }
  assert.ok(existsSync(new URL('../../report.md', import.meta.url)));
});

test('six browser persona identities and difficulties remain intact', () => {
  assert.deepEqual(PERSONAS, [
    {name: 'Impulsive Builder', difficulty: 'normal', strategy: 'build_everything'},
    {name: 'War Kid', difficulty: 'normal', strategy: 'military_focused'},
    {name: 'Cautious Explorer', difficulty: 'easy', strategy: 'explore_all_tabs'},
    {name: 'Random Clicker', difficulty: 'normal', strategy: 'random'},
    {name: 'Trader Kid', difficulty: 'normal', strategy: 'trade_focused'},
    {name: 'Speedrunner', difficulty: 'hard', strategy: 'speedrun'},
  ]);
});

test('report counts genuine terminals separately from checkpoints and failures', () => {
  const logs = [
    {...createGameLog(), outcome: 'victory' as const, finalTurn: 40},
    {...createGameLog(), outcome: 'game_over' as const, finalTurn: 18, gameOverReason: 'famine'},
    {...createGameLog(), outcome: 'checkpoint' as const, finalTurn: 1, checkpointManagementTurn: 2},
    {...createGameLog(), outcome: 'error' as const, finalTurn: 3, consoleErrors: ['native click failed']},
  ].map(log => ({...log, tabsVisited: ['market']}));
  const report = generateReport(logs);
  assert.match(report, /Victories \| 1 \(25%\)/);
  assert.match(report, /Game Overs \| 1 \(25%\)/);
  assert.match(report, /Stuck\/Crashed \| 1/);
  assert.match(report, /Partial checkpoints \| 1/);
  assert.match(report, /Avg terminal turn \(completed games only\) \| 29\.0\/40/);
  assert.match(report, /CHECKPOINT \| 1 \| 2/);
  assert.match(report, /Market \| 4\/4/);
  assert.match(report, /native click failed/);
  assert.doesNotMatch(report, /too hard|dopamine|story mode|6th-grader personas/);
});

test('invalid browser CLI exits nonzero without launching or writing a campaign report', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types',
    fileURLToPath(new URL('../../playwright-playtest.ts', import.meta.url)), '0'], {encoding: 'utf8'});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Game count must be a positive safe integer/);
  assert.doesNotMatch(result.stdout, /Evidence:|victory:|checkpoint:/);
});
