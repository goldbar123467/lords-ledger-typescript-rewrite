import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save, type GameSnapshot } from '../../../src/save/saveGame.ts';

async function openSeededCompanion(
  page: Page, station: 'Marta the Merchant' | 'Old Aldric', startingState?: GameSnapshot,
  dismissNote = true,
) {
  const started = startingState ?? gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 4 },
  });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(started));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', { name: new RegExp(station) }).click();
  const note = page.getByRole('button', { name: 'I understand' });
  if (dismissNote && await note.isVisible()) await note.click();
}

for (const companion of [
  { station: 'Marta the Merchant', title: 'Marta of Cologne', note: /The legal status of/, file: 'marta' },
  { station: 'Old Aldric', title: 'Aldric One-Eye', note: /Medieval soldiers were not the gleaming knights/, file: 'aldric' },
] as const) {
  test(`first-visit ${companion.title} note clears mobile navigation and remains readable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededCompanion(page, companion.station, undefined, false);
    await expect(page.getByRole('heading', { name: "Scribe's Note" })).toBeVisible();
    const title = await page.getByRole('heading', { name: companion.title }).boundingBox();
    const navigation = await page.locator('.tab-nav').boundingBox();
    await page.screenshot({ path: testInfo.outputPath(`${companion.file}-first-note-390.png`) });
    if (!title || !navigation) throw new Error('Companion title or navigation is missing.');
    expect(title.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
    const noteFontSize = await page.getByText(companion.note).evaluate(
      element => Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(noteFontSize).toBeGreaterThanOrEqual(14);
  });
}

test('Marta displays and resumes the seeded storage offer before one canonical purchase', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await openSeededCompanion(page, 'Marta the Merchant');
  await expect(page.getByRole('heading', { name: 'Storage Expansion' })).toBeVisible();
  await mkdir('artifacts/v2/companions-browser', { recursive: true });
  await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'artifacts/v2/companions-browser/marta-offer-1366x768.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/v2/companions-browser/marta-offer-390x844.png' });
  for (const name of ['Accept', 'Decline']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Save game' }).click();
  const pendingRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!pendingRaw) throw new Error('Marta offer did not save.');
  const pending = JSON.parse(pendingRaw).state;
  expect(pending.tavern.martaCurrentContent).toEqual({ type: 'offer', offerId: 'storage_deal', resolution: null });
  expect(pending.denarii).toBe(700);

  const resumed = await page.context().newPage();
  resumed.on('pageerror', error => errors.push(error.message));
  await resumed.setViewportSize({ width: 390, height: 844 });
  await resumed.goto('/');
  await resumed.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = resumed.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await resumed.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await resumed.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await resumed.getByRole('button', { name: /Marta the Merchant/ }).click();
  await expect(resumed.getByRole('heading', { name: 'Storage Expansion' })).toBeVisible();
  await resumed.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(resumed.getByText('The deal is struck.')).toBeVisible();
  await resumed.getByRole('button', { name: 'Save game' }).click();
  const settledRaw = await resumed.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!settledRaw) throw new Error('Marta purchase did not save.');
  const settled = JSON.parse(settledRaw).state;
  expect(settled.denarii).toBe(650);
  expect(settled.inventoryCapacity).toBe(320);
  expect(settled.tavern.martaCurrentContent.resolution).toBe('accepted');
  expect(settled.tavern.martaOffersUsed).toEqual(['storage_deal']);
  await resumed.close();
  expect(errors).toEqual([]);
});

test('Aldric shows the authored free lesson and settles it once on mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeededCompanion(page, 'Old Aldric');
  await expect(page.getByRole('heading', { name: 'Garrison Morale' })).toBeVisible();
  await expect(page.getByText('+2 families (morale draws settlers)')).toBeVisible();
  await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
  await mkdir('artifacts/v2/companions-browser', { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: 'artifacts/v2/companions-browser/aldric-offer-1366x768.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/v2/companions-browser/aldric-offer-390x844.png' });
  for (const name of ['Accept', 'Decline']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('It is done.')).toBeVisible();
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Aldric lesson did not save.');
  const settled = JSON.parse(raw).state;
  expect(settled.population).toBe(24);
  expect(settled.denarii).toBe(700);
  expect(settled.tavern.aldricCurrentContent).toEqual({
    type: 'offer', offerId: 'war_story_lesson', resolution: 'accepted',
  });
  expect(settled.tavern.aldricOffersUsed).toEqual(['war_story_lesson']);
  expect(errors).toEqual([]);
});

test('Aldric referral explains a full roster instead of offering an over-cap recruit', async ({ page }, testInfo) => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 49 } });
  const capped = {
    ...started, population: 60, garrison: 25,
    military: { ...started.military, garrison: { levy: 16, menAtArms: 9, knights: 0 } },
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeededCompanion(page, 'Old Aldric', capped);
  await expect(page.getByRole('heading', { name: 'Recruit Referral' })).toBeVisible();
  await expect(page.getByText('Need 40d and room: under 25 soldiers, 10 men-at-arms, and 60% of families.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('aldric-full-roster-390.png') });
});

test('Aldric referral names the population cap when it blocks recruitment', async ({ page }, testInfo) => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 49 } });
  const capped = {
    ...started, population: 20, garrison: 12,
    military: { ...started.military, garrison: { levy: 11, menAtArms: 1, knights: 0 } },
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeededCompanion(page, 'Old Aldric', capped);
  await expect(page.getByRole('heading', { name: 'Recruit Referral' })).toBeVisible();
  await expect(page.getByText('Need 40d and room: under 25 soldiers, 10 men-at-arms, and 60% of families.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('aldric-population-limit-390.png') });
});

for (const example of [
  { seed: 1, station: 'Marta the Merchant', label: 'Market Intelligence', text: 'Timber and clay are builder', name: 'marta-advice' },
  { seed: 1, station: 'Old Aldric', label: 'Military Counsel', text: 'I’ve seen lords spend everything', name: 'aldric-advice' },
  { seed: 5, station: 'Marta the Merchant', label: 'A Trade Story', text: 'The Hanseatic League controls trade', name: 'marta-story' },
  { seed: 5, station: 'Old Aldric', label: 'A War Story', text: 'At Crécy, English longbowmen', name: 'aldric-story' },
] as const) {
  test(`${example.station} presents ${example.label.toLowerCase()} from a saved seed`, async ({ page }, testInfo) => {
    const started = gameReducer(initialState, {
      type: 'START_GAME', payload: { difficulty: 'easy', seed: example.seed },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededCompanion(page, example.station, started);
    await expect(page.getByText(example.label, { exact: true })).toBeVisible();
    await expect(page.getByText(example.text, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Talk Again' })).toBeEnabled();
    await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`${example.name}-390.png`), fullPage: true });
  });
}
