import {test, expect, type Page} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {getTotalFood} from '../../../src/engine/economyEngine.ts';
import {readV2Save, writeV2Save, type GameSnapshot} from '../../../src/save/saveGame.ts';

function legacyStock(resource: 'grain' | 'wool', stock: number) {
  const started = gameReducer(createInitialState(17), {type: 'START_GAME', payload: {difficulty: 'easy', seed: 17}});
  const inventory = {...started.inventory, [resource]: stock};
  return {...started, inventory, food: getTotalFood(inventory)};
}

async function loadMarket(page: Page, state: GameSnapshot, width: number) {
  await page.addInitScript(raw => {
    if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
  }, writeV2Save(state));
  await page.setViewportSize({width, height: width === 390 ? 844 : 768});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  await page.getByRole('button', {name: 'Load saved game'}).click();
  const tutorial = page.getByRole('button', {name: 'I Understand'});
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', {name: /Market tab/}).click();
  if (await tutorial.isVisible()) await tutorial.click();
}

async function save(page: Page) {
  await page.getByRole('button', {name: 'Save game'}).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('No native saved snapshot.');
  const loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  expect(writeV2Save(loaded.state)).toBe(raw);
  return loaded.state;
}

for (const width of [390, 1366]) {
  test(`fraction-only stock explains haggle prerequisite and remains sellable ${width}`, async ({page}, info) => {
    const state = legacyStock('wool', 0.5);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadMarket(page, state, width);
    await page.getByRole('button', {name: /Agnes the Goodswoman/}).click();
    await page.getByRole('button', {name: 'Sell to Merchant'}).click();
    const row = page.getByTestId('merchant-sell-wool');
    await expect(row.getByRole('button', {name: 'Haggle', exact: true})).toHaveCount(0);
    await expect(row).toContainText('Haggling needs 1 whole unit.');
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('whole-unit-prerequisite.png'), fullPage: true});
    await page.getByRole('button', {name: 'Return to Market Square'}).click();
    await page.getByRole('button', {name: /Quick Trade/}).click();
    await page.getByTestId('quick-sell-wool').getByRole('button', {name: /^Sell all/}).click();
    const sold = await save(page);
    expect(sold.inventory.wool).toBe(0);
    expect(sold.denarii).toBe(state.denarii + (state.marketPrices.sell.wool ?? 0) * 0.5);
    expect(sold.rngState).toBe(state.rngState);
    expect(sold.market.activeHaggle).toBeNull();
    expect(errors).toEqual([]);
  });

  test(`whole-unit haggle controls save and resume fractional legacy stock ${width}`, async ({page}, info) => {
    const state = legacyStock('wool', 2.5);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadMarket(page, state, width);
    await page.getByRole('button', {name: /Agnes the Goodswoman/}).click();
    await page.getByRole('button', {name: 'Sell to Merchant'}).click();
    await page.getByTestId('merchant-sell-wool').getByRole('button', {name: 'Haggle', exact: true}).click();
    const quantity = page.getByTestId('haggle-quantity');
    await expect(quantity).toHaveText('2');
    await expect(page.getByRole('button', {name: 'Increase haggle quantity'})).toBeDisabled();
    const setup = page.getByRole('group', {name: 'Haggle quantity controls'});
    await setup.getByRole('button', {name: '10', exact: true}).click();
    await expect(quantity).toHaveText('2');
    await setup.getByRole('button', {name: '1', exact: true}).click();
    await expect(quantity).toHaveText('1');
    await expect(page.getByRole('button', {name: 'Decrease haggle quantity'})).toBeDisabled();
    await setup.getByRole('button', {name: '5', exact: true}).click();
    await expect(quantity).toHaveText('2');
    await setup.scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('whole-unit-setup.png'), fullPage: true});
    await page.getByRole('button', {name: 'Begin Haggling'}).click();
    const pending = await save(page);
    expect(pending.market.activeHaggle?.quantity).toBe(2);
    expect(pending.rngState).toBe(state.rngState);
    const offer = pending.market.activeHaggle?.currentOffer;
    if (offer === undefined) throw new Error('Pending quote missing.');
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game'}).click();
    await page.getByRole('button', {name: /Market tab/}).click();
    await page.getByRole('button', {name: /Agnes the Goodswoman/}).click();
    await page.getByRole('button', {name: `Accept ${offer}d (${offer * 2}d)`, exact: true}).click();
    const settled = await save(page);
    expect(settled.inventory.wool).toBe(0.5);
    expect(settled.denarii).toBe(state.denarii + offer * 2);
    expect(settled.rngState).toBe(state.rngState);
    expect(settled.market.tradesThisSeason).toBe(1);
    expect(settled.market.activeHaggle).toBeNull();
    await page.screenshot({path: info.outputPath('whole-unit-settled.png'), fullPage: true});
    expect(errors).toEqual([]);
  });

  test(`posted Sell All fills fractional grain and recomputes food ${width}`, async ({page}, info) => {
    const state = legacyStock('grain', 0.5);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadMarket(page, state, width);
    await page.getByRole('button', {name: /Quick Trade/}).click();
    const row = page.getByTestId('quick-sell-grain');
    await row.getByRole('button', {name: /^Sell all/}).click();
    const sold = await save(page);
    expect(sold.inventory.grain).toBe(0);
    expect(sold.food).toBe(state.food - 0.5);
    expect(sold.denarii).toBe(state.denarii + (state.marketPrices.sell.grain ?? 0) * 0.5);
    expect(sold.tradeCount).toBe((state.tradeCount ?? 0) + 1);
    expect(sold.rngState).toBe(state.rngState);
    await expect(row).toHaveCount(0);
    await page.screenshot({path: info.outputPath('posted-fraction-filled.png'), fullPage: true});
    expect(errors).toEqual([]);
  });

  test(`posted sales invalidate stale haggle setup before any bargain can start ${width}`, async ({page}, info) => {
    const state = legacyStock('wool', 2.5);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadMarket(page, state, width);
    await page.getByRole('button', {name: /Agnes the Goodswoman/}).click();
    await page.getByRole('button', {name: 'Sell to Merchant'}).click();
    const row = page.getByTestId('merchant-sell-wool');
    await row.getByRole('button', {name: 'Haggle', exact: true}).click();
    await expect(page.getByTestId('haggle-quantity')).toHaveText('2');
    await row.getByRole('button', {name: /^Sell 1 Wool/}).click();
    await expect(page.getByRole('button', {name: 'Begin Haggling'})).toBeDisabled();
    await expect(page.getByRole('status').filter({hasText: 'Only 1 whole unit is available.'})).toBeVisible();
    await row.getByRole('button', {name: /^Sell 1 Wool/}).click();
    await expect(row.getByRole('button', {name: 'Haggle', exact: true})).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Begin Haggling'})).toBeDisabled();
    await expect(page.getByRole('status').filter({hasText: 'No whole units are available'})).toBeVisible();
    const sold = await save(page);
    expect(sold.inventory.wool).toBe(0.5);
    expect(sold.denarii).toBe(state.denarii + (state.marketPrices.sell.wool ?? 0) * 2);
    expect(sold.market.activeHaggle).toBeNull();
    expect(sold.rngState).toBe(state.rngState);
    await page.screenshot({path: info.outputPath('stale-quantity-rejected.png'), fullPage: true});
    await page.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Begin Haggling'})).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
