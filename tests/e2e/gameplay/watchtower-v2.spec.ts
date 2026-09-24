import { expect, test } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

const saveKey = 'lords-ledger-v2-save';

test('a real Horizon Scan is clickable, rewarded once, and replays after load', async ({ page }) => {
  test.setTimeout(70000); // Two real 15-second scans plus browser navigation.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  async function dismissTutorial() {
    const button = page.getByRole('button', { name: 'I Understand' });
    if (await button.isVisible()) await button.click();
  }

  async function saveState() {
    await page.getByRole('button', { name: 'Save game' }).click();
    const raw = await page.evaluate(key => localStorage.getItem(key), saveKey);
    if (!raw) throw new Error('Watchtower save was not written.');
    return JSON.parse(raw).state;
  }

  async function completeScan() {
    await page.getByRole('button', { name: /Map tab/ }).click();
    await dismissTutorial();
    await page.locator('button[title="Climb the Watchtower"]').click();
    await page.getByRole('button', { name: /Horizon Scan/ }).click();
    await expect(page.getByRole('button', { name: 'Simulate this season' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Scan the Horizon' }).click();
    const clickable = page.locator('button[data-scan-anomaly]:not(:disabled)');
    await expect(clickable.first()).toBeVisible();
    const count = await clickable.count();
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(5);
    await clickable.first().focus();
    await page.keyboard.press('Enter');
    await expect(clickable).toHaveCount(count - 1);
    for (let index = 1; index < count; index++) await clickable.first().click();
    await expect(clickable).toHaveCount(0);
    await expect(page.getByRole('heading', { name: "Scout's Report" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(`${count}/${count}`, { exact: true })).toBeVisible();
    const acknowledge = page.getByRole('button', { name: 'Acknowledged' });
    const bounds = await acknowledge.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(bounds).not.toBeNull();
    if (bounds) expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewportHeight);
    await acknowledge.click();
    const state = await saveState();
    expect(state.watchtower.scannedThisSeason).toBe(true);
    expect(state.watchtower.lastScanResult.anomaliesFound).toBe(count);
    expect(state.denarii).toBe(700 + (count === 5 ? 10 : 5));
    await expect(page.getByRole('button', { name: /Horizon Scan/ })).toBeDisabled();
    return state;
  }

  await page.goto('/');
  await page.getByRole('button', { name: /Easy.*gentler penalties/i }).click();
  await dismissTutorial();
  const before = await saveState();
  const rawBefore = await page.evaluate(key => localStorage.getItem(key), saveKey);
  if (!rawBefore) throw new Error('Pre-scan save was not written.');
  const first = await completeScan();
  expect(first.rngState).not.toBe(before.rngState);

  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: saveKey, raw: rawBefore });
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const replay = await completeScan();
  expect(replay).toEqual(first);
  expect(errors).toEqual([]);
});

test('seeded dust and birds anomalies have separate pointer targets', async ({ page }) => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const save = writeV2Save({ ...started, rngState: 2227729493 });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), save);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Climb the Watchtower"]').click();
  await page.getByRole('button', { name: /Horizon Scan/ }).click();
  await page.getByRole('button', { name: 'Scan the Horizon' }).click();

  const dust = page.locator('button[data-scan-anomaly="dust"]');
  const birds = page.locator('button[data-scan-anomaly="birds"]');
  await expect(dust).toBeVisible();
  await expect(birds).toBeVisible();
  const dustBox = await dust.boundingBox();
  const birdsBox = await birds.boundingBox();
  expect(dustBox).not.toBeNull();
  expect(birdsBox).not.toBeNull();
  if (!dustBox || !birdsBox) return;
  expect(Math.abs((dustBox.x + dustBox.width / 2) - (birdsBox.x + birdsBox.width / 2)))
    .toBeGreaterThan(40);
  const centerTarget = await page.evaluate(box => document.elementFromPoint(
    box.x + box.width / 2, box.y + box.height / 2,
  )?.closest('[data-scan-anomaly]')?.getAttribute('data-scan-anomaly'), dustBox);
  expect(centerTarget).toBe('dust');
  await dust.click();
  await expect(dust).toBeDisabled();
  await birds.click();
  await expect(birds).toBeDisabled();
});
