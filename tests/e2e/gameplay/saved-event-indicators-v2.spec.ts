import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import seasonal from '../../../src/data/seasonalEvents.ts';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) test(`${kind} unknown consumed indicator rejects with both slots intact`, async ({ page }, info) => {
  const authored = seasonal.spring[0], event = { ...authored,
    options: authored.options.map(option => ({ ...option, indicators: { ...option.indicators, treasury: 'north' } })) };
  const state = { ...base, phase: 'seasonal_action', currentEvent: event };
  const bad = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : JSON.stringify(state);
  const v2 = kind === 'v2' ? bad : writeV2Save(base), legacy = kind === 'legacy' ? bad : JSON.stringify(base), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ v2, legacy, currentKey, oldKey }) => {
    localStorage.setItem(currentKey, v2); localStorage.setItem(oldKey, legacy);
  }, { v2, legacy, currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
  await page.screenshot({ path: info.outputPath('load-result.png'), animations: 'disabled' });
  await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/indicator treasury/);
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
    { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy });
  expect(errors).toEqual([]);
});

test('legacy omitted notes and empty indicators render and settle without rebuilding history', async ({ page }, info) => {
  const authored = seasonal.spring[0], event = { ...authored, scribesNote: undefined,
    options: authored.options.map(option => ({ ...option, indicators: { ...option.indicators, treasury: '', historicalIndicator: 'north' } })) };
  const state = { ...base, phase: 'seasonal_action', currentEvent: event }, raw = JSON.stringify(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  const choice = page.getByRole('group', { name: 'Choose your response' }).getByRole('button').nth(1);
  await expect(choice).toHaveAttribute('aria-label', /Expected effects: Food increase\.$/);
  await choice.click(); await expect(page.getByRole('button', { name: 'See What Happens Next', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: "Scribe's Note" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
  if (saved === null) throw new Error('Missing saved settlement.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state).toMatchObject({ denarii: 520, food: 380, rngState: base.rngState, scribesNote: null });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(raw);
  await page.screenshot({ path: info.outputPath('historical-settlement.png'), animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See What Happens Next', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
