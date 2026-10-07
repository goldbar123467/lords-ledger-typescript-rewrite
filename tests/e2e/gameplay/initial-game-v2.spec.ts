import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save, type GameSnapshot, type Difficulty } from '../../../src/save/saveGame.ts';

declare global { interface Window { __llFreshSeeds?: number[] } }
function snapshot(value: unknown): GameSnapshot {
  const result = readV2Save(writeV2Save(value)); if (!result.ok) throw new Error(result.error); return result.state;
}
async function observe(page: Page, raw?: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(raw => {
    if (raw && !localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    const native = globalThis.crypto.getRandomValues.bind(globalThis.crypto), seeds: number[] = [];
    window.__llFreshSeeds = seeds;
    // Observe the real cryptographic seed; do not supply a fixture seed or replace its draw.
    const observed = (array: Parameters<typeof native>[0]) => {
      const result = native(array);
      if (array instanceof Uint32Array && array.length === 1) {
        const seed = array[0]; if (seed === undefined) throw new Error('Missing real seed'); seeds.push(seed);
      }
      return result;
    };
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, value: observed });
  }, raw);
  await page.goto('/'); return errors;
}
async function settle(page: Page, difficulty: Difficulty) {
  const note = page.getByRole('button', { name: 'I Understand', exact: true }); await expect(note).toBeVisible(); await note.click();
  const seeds = await page.evaluate(() => window.__llFreshSeeds); expect(seeds).toHaveLength(1);
  const seed = seeds?.[0]; if (seed === undefined) throw new Error('App did not record its real start seed');
  const expected = snapshot(gameReducer(gameReducer(createInitialState(seed), { type: 'START_GAME', payload: { difficulty, seed } }), { type: 'DISMISS_TUTORIAL', payload: { tab: 'estate' } }));
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));
  return expected;
}
for (const row of [
  { difficulty: 'easy', label: /Easy More resources/, denarii: 700, food: 480, population: 22, garrison: 5 },
  { difficulty: 'normal', label: /Normal The standard/, denarii: 500, food: 365, population: 20, garrison: 5 },
  { difficulty: 'hard', label: /Hard Fewer resources/, denarii: 400, food: 255, population: 18, garrison: 3 },
] as const) test(`native ${row.difficulty} start constructs and saves a fresh game from its real seed`, async ({ page }, info) => {
  const errors = await observe(page); await page.getByRole('button', { name: row.label }).click();
  const expected = await settle(page, row.difficulty);
  expect([expected.denarii, expected.food, expected.population, expected.garrison]).toEqual([row.denarii, row.food, row.population, row.garrison]);
  await page.screenshot({ path: info.outputPath('started.png'), animations: 'disabled' }); expect(errors).toEqual([]);
});
for (const phase of ['game_over', 'victory'] as const) test(`native restart from a managed ${phase} fixture clears old subsystem state`, async ({ page }, info) => {
  // These terminal fixtures exercise the restart entry point; they are not reached campaigns.
  const value = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'hard', seed: 104 } });
  const terminal = snapshot({ ...value, phase, turn: 40, year: 10, season: 'winter',
    gameOverReason: phase === 'game_over' ? { type: 'bankruptcy', reason: 'Managed restart fixture' } : null,
    denarii: phase === 'game_over' ? 0 : 400, bankruptcyTurns: phase === 'game_over' ? 6 : 0,
    tavern: { ...value.tavern, wallStashFound: true, gambitRoundsThisSeason: 5, totalVisits: 99 } });
  const errors = await observe(page, writeV2Save(terminal));
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: phase === 'game_over' ? 'Try Again' : 'Reign Again', exact: true }).click();
  const expected = await settle(page, 'hard'); expect(expected.tavern.wallStashFound).toBe(false); expect(expected.tavern.totalVisits).toBe(0);
  await page.screenshot({ path: info.outputPath('restarted.png'), animations: 'disabled' }); expect(errors).toEqual([]);
});
