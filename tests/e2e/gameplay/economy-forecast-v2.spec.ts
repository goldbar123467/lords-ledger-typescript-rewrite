import { expect, test } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

for (const scenario of [
  { difficulty: 'easy', season: 'spring', turn: 1, need: 23, guidance: 'Farm output ×0.6' },
  { difficulty: 'normal', season: 'spring', turn: 1, need: 29, guidance: 'Farm output ×0.6' },
  { difficulty: 'hard', season: 'winter', turn: 4, need: 41, guidance: '+10% food consumption' },
] as const) {
  test(`Estate forecasts the executable food rule on ${scenario.difficulty} ${scenario.season}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const started = gameReducer(initialState, {
      type: 'START_GAME', payload: { difficulty: scenario.difficulty, seed: 17 },
    });
    const state = { ...started, season: scenario.season, turn: scenario.turn };
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await page.getByRole('button', { name: /Estate tab/ }).click();
    if (await tutorial.isVisible()) await tutorial.click();
    await expect(page.getByText(`${scenario.need}/season need`, { exact: false })).toBeVisible();
    await expect(page.getByText(scenario.guidance, { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`estate-${scenario.difficulty}-${scenario.season}-390.png`) });
    expect(errors).toEqual([]);
  });
}
