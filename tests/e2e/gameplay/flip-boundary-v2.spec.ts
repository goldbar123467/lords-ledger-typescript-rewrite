import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Save is missing');
  return JSON.parse(raw).state;
}

for (const [taxRate, flipId] of [['high', 'serf_week'], ['medium', 'cyoa_lord']] as const) {
  test(`${flipId} returns from a saved story without repeating seasonal work`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const started = gameReducer(createInitialState(17),
      { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
    // Fixture-assisted turn-seven boundary. The browser traverses the complete story.
    const boundary = { ...started, turn: 7, season: 'autumn', year: 2, taxRate };
    const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const entered = gameReducer(simulated, { type: 'ADVANCE_TURN' });
    expect(entered.currentFlipId).toBe(flipId);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(entered));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    const returnButton = page.getByRole('button', { name: 'Return to Your Reign', exact: true });
    for (let step = 0; step < 32 && !await returnButton.isVisible(); step++) {
      const choice = page.getByRole('button', { name: /^Option 1:/ });
      if (await choice.isVisible()) await choice.click();
      else await page.getByRole('button', { name: /^(Continue|See the Consequences)$/ }).click();
    }
    await expect(returnButton).toBeVisible();
    const summary = await save(page);
    expect(summary.phase).toBe('flip_summary');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(returnButton).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${flipId}-summary.png`) });
    await returnButton.click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
    const after = await save(page);
    expect(after.phase).toBe('management');
    expect(after.turn).toBe(8);
    expect(after.greatHall.stewardTrust).toBe(48);
    expect(after.greatHall.meterHistory).toEqual(summary.greatHall.meterHistory);
    expect(after.marketPrices).toEqual(summary.marketPrices);
    expect(after.blacksmith).toEqual(summary.blacksmith);
    expect(after.rngState).toBe(summary.rngState);
    expect(after.perspectiveFlips[flipId]).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${flipId}-returned.png`) });
    expect(errors).toEqual([]);
  });
}
