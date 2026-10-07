import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) test(`${kind} malformed Watchtower metadata rejects with both slots intact`, async ({ page }, info) => {
  const watchtower = kind === 'v2' ? { ...base.watchtower, totalScans: '3' } : { ...base.watchtower, signalLog: [null] };
  const state = { ...base, activeTab: 'map', tutorialsSeen: ['map', 'estate'], watchtower };
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
  await expect(page.getByRole('alert')).toContainText(kind === 'v2' ? 'watchtower totalScans' : 'watchtower signal log entry');
  await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
  expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
    { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy }); expect(errors).toEqual([]);
});

test('legacy Watchtower defaults retain old log, native scan, readiness and reload', async ({ page }, info) => {
  test.setTimeout(40000);
  const state = { ...base, activeTab: 'map', tutorialsSeen: ['map', 'estate'], blacksmith: { ...base.blacksmith, equipped: null },
    watchtower: { scannedThisSeason: null, scanScribesNoteSeen: true, rodericScribesNoteSeen: null,
      totalScans: null, totalAnomaliesSpotted: null, totalAnomaliesMissed: null, perfectScans: null, warnings: null,
      signalLog: [{ season: 'Historical season', year: null, text: 'Historical lookout', type: null }, {}],
      lastScanResult: { historicalRating: { kept: true } }, historicalExtension: { kept: true } } };
  const raw = JSON.stringify(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: LEGACY_SAVE_KEY });
  await page.goto('/'); await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await page.locator('button[title="Climb the Watchtower"]').click();
  await expect(page.getByText('Historical lookout')).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(writeV2Save(state));
  await page.screenshot({ path: info.outputPath('historical-watchtower.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /Horizon Scan/ }).click();
  await page.getByRole('button', { name: 'Scan the Horizon', exact: true }).click();
  const anomalies = page.locator('button[data-scan-anomaly]:not(:disabled)');
  await expect(anomalies.first()).toBeVisible();
  const count = await anomalies.count(); expect(count).toBeGreaterThanOrEqual(4); expect(count).toBeLessThanOrEqual(5);
  for (let index = 0; index < count; index++) await anomalies.first().click();
  await expect(page.getByRole('heading', { name: "Scout's Report", exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Acknowledged', exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2); if (saved === null) throw new Error('Scan not saved.');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  expect(loaded.state.watchtower).toMatchObject({ scannedThisSeason: true, totalScans: 1, totalAnomaliesSpotted: count,
    totalAnomaliesMissed: 0, perfectScans: 1, historicalExtension: { kept: true } });
  expect(loaded.state.watchtower.signalLog?.slice(0, 2)).toEqual(state.watchtower.signalLog);
  expect(loaded.state.denarii).toBe(base.denarii + (count === 5 ? 10 : 5)); expect(loaded.state.rngState).not.toBe(state.rngState);
  await page.screenshot({ path: info.outputPath('scan-settled.png'), animations: 'disabled' });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_SAVE_KEY)).toBe(raw);
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.locator('button[title="Climb the Watchtower"]').click();
  await expect(page.getByRole('button', { name: /Horizon Scan/ })).toBeDisabled();
  await expect(page.getByText('Historical lookout')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved); expect(errors).toEqual([]);
});
