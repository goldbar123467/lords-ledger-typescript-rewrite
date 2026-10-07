import {expect, test, type Page} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save} from '../../../src/save/saveGame.ts';
import encounters from '../../../src/data/audience.ts';
import {getBuyerPrice, SEASONAL_BUYERS} from '../../../src/data/blacksmith.ts';

async function save(page: Page) {
  await page.getByRole('button', {name: 'Save game', exact: true}).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Missing native save.');
  const loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  expect(writeV2Save(loaded.state)).toBe(raw);
  return {raw, state: loaded.state};
}

for (const width of [390, 1366]) for (const responseIndex of [0, 1, 2]) {
  test(`native Henrik response ${responseIndex} controls a saved Spring buyer ${width}`, async ({page}, info) => {
    const encounter = encounters.find(entry => entry.id === 'aud_002');
    const response = encounter?.responses[responseIndex];
    if (!encounter || !response) throw new Error('Missing authored Henrik response.');
    // A managed owned tool isolates buyer permission; this is not native crafting acquisition.
    let fixture = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
    fixture = gameReducer(fixture, {type: 'BLACKSMITH_FORGE_COMPLETE', payload: {itemId: 'plowshare', qualityScore: 90, completionUid: 1}});
    expect(fixture.blacksmith.inventory?.length).toBe(1);
    fixture = gameReducer(fixture, {type: 'SET_TAB', payload: {tab: 'hall'}});
    fixture = gameReducer(fixture, {type: 'DISMISS_TUTORIAL', payload: {tab: 'hall'}});
    fixture = gameReducer(fixture, {type: 'DISMISS_TUTORIAL', payload: {tab: 'forge'}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: width === 390 ? 844 : 768});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(fixture));
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    await page.getByRole('button', {name: 'Audience', exact: true}).click();
    await page.getByRole('button', {name: new RegExp(encounter.name)}).click();
    await page.getByRole('button', {name: 'Reveal full petition', exact: true}).click();
    await page.getByRole('button', {name: new RegExp(response.label)}).click();
    await expect(page.getByText(response.aftermath, {exact: false})).toBeVisible();
    const audience = await save(page);
    expect(audience.state.greatHall.audienceResolved).toContain('aud_002');
    expect(audience.state.rngState).toBe(fixture.rngState);
    await page.screenshot({path: info.outputPath('audience-response.png')});
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    expect((await save(page)).raw).toBe(audience.raw);
    await page.getByRole('button', {name: 'Audience', exact: true}).click();
    await expect(page.getByRole('button', {name: new RegExp(encounter.name)})).toHaveCount(0);
    await page.getByRole('button', {name: 'Forge tab', exact: true}).click();
    await page.locator('button').filter({has: page.locator('span').filter({hasText: /^Armory$/})}).click();
    await page.screenshot({path: info.outputPath('spring-buyers.png'), fullPage: true});
    const buyerHeading = page.getByRole('heading', {name: 'Henrik the Trader', exact: true});
    if (responseIndex === 2) await expect(buyerHeading).toHaveCount(0);
    else {
      await expect(buyerHeading).toBeVisible();
      const before = (await save(page)).state;
      const item = before.blacksmith.inventory?.[0];
      const buyer = SEASONAL_BUYERS.find(entry => entry.id === 'foreign_merchant');
      if (!item || !buyer) throw new Error('Missing saved tool or buyer.');
      const price = getBuyerPrice(buyer, item, before.blacksmith.salesThisSeason ?? 0);
      const card = buyerHeading.locator('..').locator('..').locator('..');
      await card.getByRole('button', {name: `${item.name} (${price}d)`, exact: true}).click();
      await page.getByRole('button', {name: 'Sell', exact: true}).click();
      const after = (await save(page)).state;
      expect(after.denarii).toBe(before.denarii + price);
      expect(after.blacksmith.inventory?.some(entry => entry.uid === item.uid)).toBe(false);
      expect(after.blacksmith.salesThisSeason).toBe((before.blacksmith.salesThisSeason ?? 0) + 1);
      expect(after.rngState).toBe(before.rngState);
    }
    expect(errors).toEqual([]);
  });
}
