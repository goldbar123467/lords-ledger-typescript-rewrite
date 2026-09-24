import { expect, test } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

function textContrast(foreground: string, background: string): number {
  function luminance(color: string): number {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unrecognized CSS color: ${color}`);
    const linear = channels.map(channel => {
      const scaled = channel / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    });
    return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  }
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('a real merchant bargain survives save and settles once at its displayed price', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  await page.addInitScript(raw => {
    if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
  }, writeV2Save(started));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Edmund the Grain Merchant/ }).click();
  const merchantTitle = await page.getByRole('heading', { name: 'Edmund the Grain Merchant' }).boundingBox();
  const navigation = await page.locator('.tab-nav').boundingBox();
  if (!merchantTitle || !navigation) throw new Error('Market heading or navigation is missing.');
  expect(merchantTitle.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  await page.getByRole('button', { name: 'Sell to Merchant' }).click();
  await page.getByRole('button', { name: 'Haggle', exact: true }).first().click();
  await page.getByRole('button', { name: 'Begin Haggling' }).click();
  const bargainTitle = await page.getByRole('heading', { name: 'Edmund the Grain Merchant' }).boundingBox();
  const bargainNavigation = await page.locator('.tab-nav').boundingBox();
  if (!bargainTitle || !bargainNavigation) throw new Error('Bargain heading or navigation is missing.');
  expect(bargainTitle.y).toBeGreaterThanOrEqual(bargainNavigation.y + bargainNavigation.height);
  await page.getByRole('button', { name: 'Save game' }).click();
  const pendingRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!pendingRaw) throw new Error('Pending bargain did not save.');
  const pending = JSON.parse(pendingRaw).state;
  expect(pending.market.activeHaggle.merchantId).toBe('edmund');
  expect(pending.market.activeHaggle.resource).toBe('grain');
  expect(pending.market.activeHaggle.quantity).toBe(5);
  const offer = pending.market.activeHaggle.currentOffer;
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: testInfo.outputPath('haggle-pending-1366.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('haggle-pending-390.png') });

  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  await expect(page.getByRole('button', { name: /Giovanni the Venetian/ })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Finish your bargain with Edmund');
  await page.getByRole('button', { name: /Edmund the Grain Merchant/ }).click();
  const loadedTitle = await page.getByRole('heading', { name: 'Edmund the Grain Merchant' }).boundingBox();
  const loadedNavigation = await page.locator('.tab-nav').boundingBox();
  if (!loadedTitle || !loadedNavigation) throw new Error('Loaded market heading or navigation is missing.');
  expect(loadedTitle.y).toBeGreaterThanOrEqual(loadedNavigation.y + loadedNavigation.height);
  await page.getByRole('button', { name: new RegExp(`Accept ${offer}d`) }).click();
  await page.getByRole('button', { name: 'Save game' }).click();
  const settledRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!settledRaw) throw new Error('Settled bargain did not save.');
  const settled = JSON.parse(settledRaw).state;
  expect(settled.denarii).toBe(started.denarii + offer * 5);
  expect(settled.inventory.grain).toBe(started.inventory.grain - 5);
  expect(settled.market.activeHaggle).toBeNull();
  expect(settled.market.tradesThisSeason).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('haggle-settled-390.png') });
  expect(errors).toEqual([]);
});

test('merchant stalls expose missing authored buy goods and premium foreign demand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const withCloth = {
    ...started,
    inventory: { ...started.inventory, cloth: 2 },
    market: { ...started.market, reputation: { ...started.market.reputation, giovanni: 82 } },
  };
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(withCloth));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Agnes the Goodswoman/ }).click();
  await page.getByRole('button', { name: 'Buy from Merchant' }).click();
  await expect(page.getByText('Wool', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Market Square' }).click();
  await expect(page.getByRole('button', { name: /Giovanni the Venetian/ })).toContainText('Valued Partner');
  await page.getByRole('button', { name: /Giovanni the Venetian/ }).click();
  await expect(page.getByText('Valued Partner')).toBeVisible();
  await page.getByRole('button', { name: 'Sell to Merchant' }).click();
  await expect(page.getByText('Cloth', { exact: true })).toBeVisible();
  await expect(page.getByText('Premium', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an understock pending bargain explains why it cannot settle', async ({ page }) => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 5, mode: 'sell' },
  });
  const shortStock = gameReducer(pending, {
    type: 'SELL_RESOURCE', payload: { resource: 'grain', quantity: 349 },
  });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(shortStock));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Edmund the Grain Merchant/ }).click();
  await expect(page.getByRole('status')).toContainText('Not enough stock');
  await expect(page.getByRole('button', { name: /Accept \d+d/ })).toBeDisabled();
});

test('a malformed reputation with no pending deal is rejected without losing the saved bytes', async ({ page }) => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const envelope = JSON.parse(writeV2Save(started));
  envelope.state.market.reputation.edmund = 'bad';
  const raw = JSON.stringify(envelope);
  await page.addInitScript(save => localStorage.setItem('lords-ledger-v2-save', save), raw);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('market reputation is invalid');
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
});

test('earned trade bonuses appear in merchant and Quick Trade sale quotes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const bonusState = {
    ...started,
    inventory: { ...started.inventory, wool: 5 },
    synergies: { ...started.synergies, activated: ['market_king_1', 'wool_baron_1', 'wool_baron_2'] },
  };
  const base = started.marketPrices.sell.wool;
  const quote = base + 3;
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(bonusState));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Agnes the Goodswoman/ }).click();
  await page.getByRole('button', { name: 'Sell to Merchant' }).click();
  const merchantWool = page.getByTestId('merchant-sell-wool');
  await expect(merchantWool).toContainText(`${quote}d`);
  await merchantWool.getByRole('button', { name: 'Haggle' }).click();
  await expect(page.getByText(`Haggle reference: ${base}d each`, { exact: false })).toBeVisible();
  await expect(page.getByText('Quick sale includes your earned trade bonuses')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await merchantWool.getByRole('button', { name: `Sell 1 Wool for ${quote}d` }).click();
  await page.getByRole('button', { name: 'Return to Market Square' }).click();
  await page.getByRole('button', { name: 'Quick Trade' }).click();
  const quickWool = page.getByTestId('quick-sell-wool');
  await expect(quickWool).toContainText(`${quote}d`);
  await quickWool.getByRole('button', { name: `Sell 1 Wool for ${quote}d`, exact: true }).click();
  const salt = page.getByTestId('quick-buy-salt');
  await expect(salt).toContainText('Preserves food');
  const saltPrice = started.marketPrices.buy.salt;
  const saltButton = salt.getByRole('button', { name: `Buy 1 Salt for ${saltPrice}d`, exact: true });
  await expect(salt.getByRole('button', { name: `Buy 5 Salt for ${saltPrice * 5}d`, exact: true })).toBeVisible();
  await saltButton.scrollIntoViewIfNeeded();
  const saltBounds = await saltButton.boundingBox();
  expect(saltBounds?.height).toBeGreaterThanOrEqual(44);
  expect(saltBounds?.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('quick-trade-top-320-after.png') });
  const livestockRow = page.getByTestId('quick-sell-livestock');
  const stockBox = await livestockRow.getByText(`(${started.inventory.livestock})`, { exact: true }).boundingBox();
  const sellPriceBox = await livestockRow.locator('span[title="Quick sale price including earned bonuses"]').boundingBox();
  if (!stockBox || !sellPriceBox) throw new Error('Livestock stock or quote is not rendered.');
  expect(sellPriceBox.x - (stockBox.x + stockBox.width)).toBeGreaterThanOrEqual(8);
  const buyPriceElement = salt.getByText(`${saltPrice}d`, { exact: true });
  const foreground = await buyPriceElement.evaluate(element => getComputedStyle(element).color);
  const background = await salt.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(textContrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  await salt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('quick-trade-320-after.png') });
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Quick sale did not save.');
  const settled = JSON.parse(raw).state;
  expect(settled.denarii).toBe(started.denarii + quote * 2);
  expect(settled.inventory.wool).toBe(3);
  expect(errors).toEqual([]);
});

test('a malformed synergy list cannot load into an unusable Market', async ({ page }) => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  const envelope = JSON.parse(writeV2Save(started));
  envelope.state.synergies.activated = '';
  const raw = JSON.stringify(envelope);
  await page.addInitScript(save => localStorage.setItem('lords-ledger-v2-save', save), raw);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('synergy');
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
});

test('posted and merchant prices stay readable and stall actions identify their trade', async ({ page }, testInfo) => {
  const started = gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(started));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Market tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();

  const board = page.getByTestId('market-price-board');
  const boardQuote = board.getByTestId('board-buy-grain');
  expect(textContrast(
    await boardQuote.evaluate(element => getComputedStyle(element).color),
    await board.evaluate(element => getComputedStyle(element).backgroundColor),
  )).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: testInfo.outputPath('market-board-320.png') });

  await page.getByRole('button', { name: /Agnes the Goodswoman/ }).click();
  await page.getByRole('button', { name: 'Buy from Merchant' }).click();
  const wool = page.getByTestId('merchant-buy-wool');
  const merchantQuote = wool.getByText(/^\d+d$/);
  expect(textContrast(
    await merchantQuote.evaluate(element => getComputedStyle(element).color),
    await wool.evaluate(element => getComputedStyle(element).backgroundColor),
  )).toBeGreaterThanOrEqual(4.5);
  for (const quantity of [1, 5]) {
    const button = wool.getByRole('button', { name: new RegExp(`^Buy ${quantity} Wool for \\d+d$`) });
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('agnes-buy-320.png') });
  await page.getByRole('button', { name: 'Return to Market Square' }).click();
  await page.getByRole('button', { name: /Edmund the Grain Merchant/ }).click();
  await page.getByRole('button', { name: 'Sell to Merchant' }).click();
  const grain = page.getByTestId('merchant-sell-grain');
  for (const quantity of [1, 5]) {
    const button = grain.getByRole('button', { name: new RegExp(`^Sell ${quantity} Grain for \\d+d$`) });
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('edmund-sell-320.png') });
});
