import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) for (const view of ['active', 'aftermath']) {
  test(`Load resets a mounted ${view} audience at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const state = { ...createInitialState(104), phase: 'management', activeTab: 'hall', tutorialsSeen: ['hall'] };
    const raw = writeV2Save(state), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Audience', exact: true }).click();
    await page.getByRole('button', { name: /Old Martha/ }).click();
    await expect(page.getByRole('button', { name: /Feed her from the kitchen/ })).toBeVisible({ timeout: 15000 });
    if (view === 'aftermath') await page.getByRole('button', { name: /Feed her from the kitchen/ }).click();
    await page.screenshot({ path: info.outputPath('before-load.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Audience', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Audience Chamber', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Old Martha/ })).toBeEnabled();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await page.screenshot({ path: info.outputPath('after-load.png'), fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('Pointer speech skip keeps the complete petition visible', async ({ page }) => {
  const state = { ...createInitialState(104), phase: 'management', activeTab: 'hall', tutorialsSeen: ['hall'] };
  const raw = writeV2Save(state);
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
  await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: 'Audience', exact: true }).click();
  await page.getByRole('button', { name: /Old Martha/ }).click();
  await page.locator('.dispute-cursor').locator('..').click();
  await expect(page.getByRole('button', { name: /Feed her from the kitchen/ })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.getByText("My lord, I've not eaten in three days. My husband died at harvest and the village will not share their stores with a widow. I beg you — even scraps from the kitchen would keep my bones together another week.", { exact: true }).count()).toBe(1);
});
