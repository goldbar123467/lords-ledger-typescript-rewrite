import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) test(`${kind} malformed raid history rejects with both slots intact`, async ({ page }, info) => {
  const state = { ...base, raids: { ...base.raids, totalCriminalRaids: '3' } };
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
  await expect(page.getByRole('alert')).toContainText(/raid totalCriminalRaids/);
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
    { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy }); expect(errors).toEqual([]);
});

test('legacy null raid bookkeeping retains warning, defense, history and reload', async ({ page }, info) => {
  const state = { ...base, phase: 'raid_warning', military: { ...base.military, walls: 4, gate: 4, moat: 3 },
    raids: { ...base.raids, totalCriminalRaids: null, criminalVictories: null, totalDenariiRecovered: null,
      activeRaid: { type: 'criminal', phase: 'warning' }, historicalExtension: { kept: true } } };
  const raw = JSON.stringify(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await page.getByRole('button', { name: 'Defend the Estate', exact: true }).click();
  await page.getByRole('dialog', { name: "Scribe's Note" }).getByRole('button', { name: 'Continue', exact: true }).click();
  const outcome = page.getByRole('dialog', { name: 'RAID REPELLED', exact: true });
  await expect(outcome).toBeVisible(); await page.screenshot({ path: info.outputPath('raid-result.png'), animations: 'disabled' });
  await outcome.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See What Happens Next', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click(); await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2); if (saved === null) throw new Error('Missing raid settlement.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state.raids).toMatchObject({ totalCriminalRaids: 1, criminalVictories: 1, activeRaid: null, historicalExtension: { kept: true } });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(raw);
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See What Happens Next', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
