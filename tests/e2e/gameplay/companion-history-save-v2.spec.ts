import {test, expect, type Page} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save} from '../../../src/save/saveGame.ts';

async function enterCompanion(page: Page, station: string) {
  await page.getByRole('button', {name: 'Load saved game'}).click();
  const tutorial = page.getByRole('button', {name: 'I Understand'});
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', {name: /Map tab/}).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', {name: new RegExp(station)}).click();
  const note = page.getByRole('button', {name: 'I understand'});
  if (await note.isVisible()) await note.click();
}

async function savedState(page: Page) {
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Native Save did not write a snapshot.');
  const loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  expect(writeV2Save(loaded.state)).toBe(raw);
  return loaded.state;
}

for (const companion of [
  {kind: 'marta', station: 'Marta the Merchant', heading: 'Storage Expansion', id: 'storage_deal',
    settled: 'The deal is struck.', cost: 50},
  {kind: 'aldric', station: 'Old Aldric', heading: 'Garrison Morale', id: 'war_story_lesson',
    settled: 'It is done.', cost: 0},
] as const) {
  test(`${companion.kind} saves an offer selected from omitted history and resumes native settlement`, async ({page}, testInfo) => {
    const started = gameReducer(createInitialState(4), {
      type: 'START_GAME', payload: {difficulty: 'easy', seed: 4},
    });
    const older = {...started, tavern: {...started.tavern}};
    delete older.tavern[`${companion.kind}OffersUsed`];
    delete older.tavern[`${companion.kind}AdviceRemaining`];
    delete older.tavern[`${companion.kind}StoriesRemaining`];
    const originalRaw = writeV2Save(older);
    expect(readV2Save(originalRaw).ok).toBe(true);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), originalRaw);
    await page.setViewportSize({width: 390, height: 844});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/');
    await enterCompanion(page, companion.station);
    await expect(page.getByRole('heading', {name: companion.heading})).toBeVisible();
    await page.getByRole('button', {name: 'Save game'}).click();
    const pending = await savedState(page);
    expect(pending.tavern[`${companion.kind}CurrentContent`]).toEqual({
      type: 'offer', offerId: companion.id, resolution: null,
    });
    expect(pending.tavern[`${companion.kind}OffersUsed`]).toEqual([]);
    expect(pending.denarii).toBe(700);
    await expect(page.locator('.quill-appear').last()).toHaveCSS('opacity', '1');
    await page.screenshot({path: testInfo.outputPath(`${companion.kind}-pending-history.png`), fullPage: true});

    const resumed = await page.context().newPage();
    resumed.on('pageerror', error => errors.push(error.message));
    await resumed.setViewportSize({width: 390, height: 844});
    await resumed.emulateMedia({reducedMotion: 'reduce'});
    await resumed.goto('/');
    await enterCompanion(resumed, companion.station);
    await expect(resumed.getByRole('heading', {name: companion.heading})).toBeVisible();
    await resumed.getByRole('button', {name: 'Accept', exact: true}).click();
    await expect(resumed.getByText(companion.settled)).toBeVisible();
    await expect(resumed.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
    await resumed.getByRole('button', {name: 'Save game'}).click();
    const settled = await savedState(resumed);
    expect(settled.denarii).toBe(700 - companion.cost);
    expect(settled.tavern[`${companion.kind}OffersUsed`]).toEqual([companion.id]);
    expect(settled.tavern[`${companion.kind}CurrentContent`]).toEqual({
      type: 'offer', offerId: companion.id, resolution: 'accepted',
    });
    if (companion.kind === 'marta') expect(settled.inventoryCapacity).toBe(320);
    else expect(settled.population).toBe(24);
    await resumed.screenshot({path: testInfo.outputPath(`${companion.kind}-settled-history.png`), fullPage: true});
    await resumed.close();
    expect(errors).toEqual([]);
  });
}
