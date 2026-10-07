import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) test(`${kind} malformed synergy metadata rejects with both slots intact`, async ({ page }, info) => {
  const synergies = kind === 'v2' ? { ...base.synergies, woolTrades: '3' } : { ...base.synergies, tradeTypes: {} };
  const state = { ...base, activeTab: 'market', tutorialsSeen: ['market', 'estate'], synergies };
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
  await expect(page.getByRole('alert')).toContainText(kind === 'v2' ? 'synergy woolTrades' : 'synergy tradeTypes');
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
    { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy }); expect(errors).toEqual([]);
});

test('legacy synergy defaults and fractions survive native trades and reload', async ({ page }, info) => {
  const state = { ...base, activeTab: 'market', tutorialsSeen: ['market', 'estate'], inventory: { ...base.inventory, wool: 2 },
    synergies: { ...base.synergies, woolTrades: 4.5, spicePurchases: 2.5, lowTaxTurns: null, foodSurplusTurns: null,
      revoltTriggered: null, tradeTypes: ['historical-resource'], historicalExtension: { kept: true } } };
  const raw = JSON.stringify(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(writeV2Save(state));
  await page.getByRole('button', { name: /Quick Trade/ }).click();
  const sell = page.getByTestId('quick-sell-wool').getByRole('button', { name: /^Sell 1 Wool for/ });
  const buy = page.getByTestId('quick-buy-spices').getByRole('button', { name: /^Buy 1 Spices for/ });
  const sellQuote = (await sell.getAttribute('aria-label'))?.match(/for (\d+)d$/), buyQuote = (await buy.getAttribute('aria-label'))?.match(/for (\d+)d$/);
  if (!sellQuote?.[1] || !buyQuote?.[1]) throw new Error('Native trade quotes missing.');
  await sell.click(); await buy.click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2); if (saved === null) throw new Error('Trade settlement missing.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state.denarii).toBe(base.denarii + Number(sellQuote[1]) - Number(buyQuote[1]));
  expect(loaded.state.inventory.wool).toBe(1); expect(loaded.state.inventory.spices).toBe(1);
  expect(loaded.state.synergies).toMatchObject({ woolTrades: 5.5, spicePurchases: 3.5, lowTaxTurns: null, foodSurplusTurns: null,
    revoltTriggered: null, tradeTypes: ['historical-resource', 'wool', 'spices'], historicalExtension: { kept: true } });
  expect(loaded.state.rngState).toBe(state.rngState);
  await page.screenshot({ path: info.outputPath('trade-settled.png'), animations: 'disabled' });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(raw);
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('button', { name: /Quick Trade/ })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
