import { expect, test, type Page } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

async function planFeast(page: Page) {
  await page.getByRole('button', { name: 'Feast', exact: true }).click();
  const village = page.getByRole('button', { name: /The Village Folk/ });
  await village.click();
  await expect(village).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /The Clergy/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Hire Musicians/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Modest Fare/ }).click();
  await page.getByRole('button', { name: 'Begin the Feast' }).click();
}

test('a planned feast previews and settles the saved authored event once', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  await page.addInitScript(raw => {
    if (!localStorage.getItem('lords-ledger-v2-save')) {
      localStorage.setItem('lords-ledger-v2-save', raw);
    }
  }, writeV2Save(started));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Hall tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await planFeast(page);
  const title = await page.getByRole('heading', { name: 'The Feast Begins' }).boundingBox();
  const navigation = await page.locator('.tab-nav').boundingBox();
  if (!title || !navigation) throw new Error('Feast heading or navigation is missing.');
  expect(title.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  await expect(page.getByText('A young couple announces their engagement before the whole hall.')).toBeVisible();
  await expect(page.getByText('People +9')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('feast-preview-1366.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const box = await page.getByRole('button', { name: 'Feast', exact: true }).boundingBox();
    return box ? box.x + box.width : Infinity;
  }).toBeLessThanOrEqual(390);
  const feastTab = await page.getByRole('button', { name: 'Feast', exact: true }).boundingBox();
  expect(feastTab?.width).toBeGreaterThanOrEqual(80);
  if (!feastTab) throw new Error('Feast navigation button is missing.');
  expect(feastTab.x + feastTab.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('feast-preview-390.png') });
  await page.getByRole('button', { name: 'Save game' }).click();
  const pendingRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!pendingRaw) throw new Error('Feast preview did not save.');
  const pending = JSON.parse(pendingRaw).state;
  expect(pending.rngState).toBe(2775531185);
  expect(pending.greatHall.hasFeastedThisSeason).toBe(false);

  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await planFeast(page);
  await expect(page.getByText('A young couple announces their engagement before the whole hall.')).toBeVisible();

  await page.getByRole('button', { name: 'Return to Throne' }).click();
  await expect(page.getByText('You have already held a feast this season.')).toBeVisible();
  const settledTitle = await page.getByRole('heading', { name: 'The Feast Hall' }).boundingBox();
  const hallTitle = await page.getByRole('heading', { name: 'The Great Hall' }).boundingBox();
  const settledNavigation = await page.locator('.tab-nav').boundingBox();
  if (!settledTitle || !hallTitle || !settledNavigation) throw new Error('Hall heading or navigation is missing.');
  expect(hallTitle.y).toBeGreaterThanOrEqual(settledNavigation.y + settledNavigation.height);
  expect(settledTitle.y).toBeGreaterThanOrEqual(settledNavigation.y + settledNavigation.height);
  await page.getByRole('button', { name: 'Save game' }).click();
  const settledRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!settledRaw) throw new Error('Feast result did not save.');
  const settled = JSON.parse(settledRaw).state;
  expect(settled.rngState).toBe(312129702);
  expect(settled.greatHall.meters).toEqual({ people: 59, treasury: 46, church: 51, military: 50 });
  expect(settled.greatHall.feastHistory).toHaveLength(1);
  expect(settled.greatHall.feastHistory[0].eventId).toBe('proposal');
  const savedTitle = await page.getByRole('heading', { name: 'The Great Hall' }).boundingBox();
  const savedNavigation = await page.locator('.tab-nav').boundingBox();
  if (!savedTitle || !savedNavigation) throw new Error('Saved Hall heading or navigation is missing.');
  expect(savedTitle.y).toBeGreaterThanOrEqual(savedNavigation.y + savedNavigation.height);
  await page.screenshot({ path: testInfo.outputPath('feast-settled-390.png') });
  expect(errors).toEqual([]);
});

test('an accepted older save without Feast history settles without blanking the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const older = structuredClone(started);
  delete older.greatHall.feastHistory;
  delete older.greatHall.hasFeastedThisSeason;
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(older));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Hall tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await planFeast(page);
  await page.getByRole('button', { name: 'Return to Throne' }).click();
  await expect(page.getByText('You have already held a feast this season.')).toBeVisible();
  expect(errors).toEqual([]);
});
