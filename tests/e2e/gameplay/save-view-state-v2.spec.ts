import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'easy', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) for (const row of [
  { name: 'resource delta', patch: { resourceDeltas: { denarii: 'lots', food: 0, population: 0, garrison: 0 } }, error: /resourceDeltas.denarii/ },
  { name: 'scribe text', patch: { scribesNote: true }, error: /scribesNote/ },
] as const) test(`malformed ${kind} ${row.name} rejects before rendering and preserves both slots`, async ({ page }, info) => {
  const state = { ...base, ...row.patch }, raw = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : JSON.stringify(state);
  const v2 = kind === 'v2' ? raw : writeV2Save(base), legacy = kind === 'legacy' ? raw : JSON.stringify(base);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ v2, legacy }) => { localStorage.setItem('lords-ledger-v2-save', v2); localStorage.setItem('lords-ledger-save', legacy); }, { v2, legacy });
  await page.goto('/'); await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
  await page.screenshot({ path: info.outputPath('load-result.png'), animations: 'disabled' });
  await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(row.error);
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(() => ({ v2: localStorage.getItem('lords-ledger-v2-save'), legacy: localStorage.getItem('lords-ledger-save') }))).toEqual({ v2, legacy });
  expect(errors).toEqual([]);
});
