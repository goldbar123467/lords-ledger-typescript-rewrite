import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) test(`${kind} malformed market metadata rejects with both slots intact`, async ({ page }, info) => {
  const market = kind === 'v2' ? { ...base.market, totalTradesLifetime: '3' }
    : { ...base.market, activeMarketEvent: { title: { malformed: true } } };
  const state = { ...base, activeTab: 'market', market };
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
  await expect(page.getByRole('alert')).toContainText(kind === 'v2' ? 'market totalTradesLifetime' : 'market event title');
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
    { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy }); expect(errors).toEqual([]);
});

test('legacy market defaults preserve a native bargain and exact reload', async ({ page }, info) => {
  const state = { ...base, activeTab: 'market', tutorialsSeen: ['market', 'estate'], market: { reputation: {},
    totalTradesLifetime: null, haggleTradesUsed: null, usedMarketEventIds: null, marketScribesNoteSeen: null,
    activeMarketEvent: { title: null, description: 'Historical market wording', bannerColor: '', effect: { noHaggling: null } },
    historicalExtension: { kept: true } } };
  const raw = JSON.stringify(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await expect(page.getByText('Historical market wording', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(writeV2Save(state));
  await page.getByRole('button', { name: /Edmund the Grain Merchant/ }).click();
  await page.getByRole('button', { name: 'Sell to Merchant', exact: true }).click();
  await page.getByRole('button', { name: 'Haggle', exact: true }).first().click();
  await page.getByRole('button', { name: 'Begin Haggling', exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const pendingRaw = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
  if (pendingRaw === null) throw new Error('Pending bargain not saved.');
  const pending = readV2Save(pendingRaw); if (!pending.ok) throw new Error(pending.error);
  const haggle = pending.state.market.activeHaggle; if (!haggle) throw new Error('Pending bargain missing.');
  await page.screenshot({ path: info.outputPath('historical-bargain.png'), animations: 'disabled' });
  await page.getByRole('button', { name: new RegExp(`^Accept ${haggle.currentOffer}d`) }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2); if (saved === null) throw new Error('Settlement missing.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state.denarii).toBe(base.denarii + haggle.currentOffer * haggle.quantity);
  expect(loaded.state.inventory.grain).toBe(base.inventory.grain - haggle.quantity);
  expect(loaded.state.market).toMatchObject({ totalTradesLifetime: 1, haggleTradesUsed: 1, activeHaggle: null, historicalExtension: { kept: true } });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(raw);
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByText('Historical market wording', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
