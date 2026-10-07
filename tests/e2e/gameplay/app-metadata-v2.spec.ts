import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const metadata of [
  { currentFlipId: '__proto__', currentFlipStats: {} },
  { currentFlipId: 'constructor', currentFlipStats: {} },
  { activeTab: '__proto__' },
  { activeTab: 'constructor' },
  { activeTab: 'lost-historical-tab' },
]) test(`compatible historical metadata renders without rewriting: ${JSON.stringify(metadata)}`, async ({ page }, info) => {
  const state = { ...base, ...metadata, tutorialsSeen: ['estate'], scribesNote: null };
  const legacy = JSON.stringify(state), expected = writeV2Save(state), sentinel = writeV2Save(base);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ legacy, sentinel, oldKey, newKey }) => {
    if (!localStorage.getItem(oldKey)) localStorage.setItem(oldKey, legacy);
    if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, sentinel);
  }, { legacy, sentinel, oldKey: LEGACY_SAVE_KEY, newKey: SAVE_KEY_V2 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Build \(/ }).first()).toBeVisible({ timeout: 8000 });
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(sentinel);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(expected);
  await page.screenshot({ path: info.outputPath('compatible-metadata.png'), animations: 'disabled' });
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Build \(/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(expected);
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(legacy);
  expect(errors).toEqual([]);
});
