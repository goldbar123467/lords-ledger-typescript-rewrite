import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const count of [Number.MAX_SAFE_INTEGER, '9007199254740992']) test(`sustained counter ${count} advances by native Continue and reloads exactly`, async ({ page }, info) => {
  const state = { ...base, phase: 'random_resolve', tutorialsSeen: ['estate', 'chronicle'], chapel: { ...base.chapel, faith: 80 },
    greatHall: { ...base.greatHall, meters: { ...base.greatHall.meters, people: 80 } },
    synergies: { ...base.synergies, highFaithTurns: count, highPeopleTurns: count, historicalExtension: { kept: true } } };
  const legacy = JSON.stringify(state), sentinel = writeV2Save(base), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ legacy, sentinel, currentKey, oldKey }) => {
    if (localStorage.getItem(oldKey) === null) localStorage.setItem(oldKey, legacy);
    if (localStorage.getItem(currentKey) === null) localStorage.setItem(currentKey, sentinel);
  }, { legacy, sentinel, currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(sentinel);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simulate this season', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.screenshot({ path: info.outputPath('save-result.png'), animations: 'disabled' });
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2); if (saved === null) throw new Error('Saved continuation missing.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state.turn).toBe(2); expect(loaded.state.phase).toBe('management');
  expect(loaded.state.synergies).toMatchObject({ highFaithTurns: (BigInt(count) + 1n).toString(), highPeopleTurns: (BigInt(count) + 1n).toString(), historicalExtension: { kept: true } });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(legacy);
  await page.screenshot({ path: info.outputPath('saved-continuation-ready.png'), animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simulate this season', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
