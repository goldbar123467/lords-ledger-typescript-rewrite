/** Mandatory native Market flows with exact transaction and persistence checks. */
import {test, expect, type Page} from '@playwright/test';
import {startGame, navigateToTab} from '../helpers.ts';
import {present} from '../../gameInput.ts';
import {readV2Save, SAVE_KEY_V2} from '../../../src/save/saveGame.ts';

async function saveSnapshot(page: Page) {
  await page.getByRole('button', {name: 'Save game', exact: true}).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
  if (!raw) throw new Error('Native Market flow did not produce a save.');
  const loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  return {raw, state: loaded.state};
}

async function openMerchant(page: Page, mode: 'sell' | 'buy') {
  await page.getByRole('button', {name: /Edmund the Grain Merchant/}).click();
  await expect(page.getByRole('heading', {name: 'Edmund the Grain Merchant', exact: true})).toBeVisible();
  await page.getByRole('button', {name: mode === 'sell' ? 'Sell to Merchant' : 'Buy from Merchant', exact: true}).click();
  const row = page.getByTestId(`merchant-${mode}-grain`);
  await expect(row).toBeVisible();
  return row;
}

test.describe('Market Tab', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/');
    await startGame(page, 'easy');
    await navigateToTab(page, 'Market');
  });

  test('market square is visible with merchant content', async ({page}) => {
    await expect(page.getByTestId('market-price-board')).toBeVisible();
    await expect(page.getByRole('button', {name: /Edmund the Grain Merchant/})).toBeVisible();
  });

  test('sell mode shows available resources to sell', async ({page}) => {
    const row = await openMerchant(page, 'sell');
    await expect(row).toContainText('Grain');
    await expect(row.getByRole('button', {name: /^Sell 1 Grain for \d+d$/})).toBeEnabled();
  });

  test('buy mode shows available resources to purchase', async ({page}) => {
    const row = await openMerchant(page, 'buy');
    await expect(row).toContainText('Supply: 100 this season');
    await expect(row.getByRole('button', {name: /^Buy 1 Grain for \d+d$/})).toBeEnabled();
  });

  for (const width of [390, 1366]) for (const mode of ['sell', 'buy'] as const) {
    test(`${mode === 'sell' ? 'selling a resource increases' : 'buying a resource decreases'} denarii at ${width}px`, async ({page}, info) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({width, height: 844});
      const row = await openMerchant(page, mode);
      const before = await saveSnapshot(page);
      const grain = present(before.state.inventory.grain, 'starting grain');
      const tradeCount = present(before.state.tradeCount, 'starting trade counter');
      expect(grain).toBeGreaterThan(0);
      expect(before.state.market.supply).toBeUndefined();
      const verb = mode === 'sell' ? 'Sell' : 'Buy';
      const action = row.getByRole('button', {name: new RegExp(`^${verb} 1 Grain for \\d+d$`)});
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
      const label = present(await action.getAttribute('aria-label'), 'trade price label');
      const price = Number(present(label.match(/ for (\d+)d$/)?.[1], 'displayed trade price'));
      expect(Number.isSafeInteger(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
      const delta = mode === 'sell' ? -1 : 1;
      const cash = before.state.denarii - delta * price;
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({path: info.outputPath('before-trade.png'), animations: 'disabled'});
      await action.click();
      await expect(page.getByTestId('resource-denarii')).toHaveText(`${cash}d`);
      const after = await saveSnapshot(page);
      expect(after.state.denarii).toBe(cash);
      expect(after.state.inventory).toEqual({...before.state.inventory, grain: grain + delta});
      expect(after.state.food).toBe(before.state.food + delta);
      expect(after.state.tradeCount).toBe(tradeCount + 1);
      expect(after.state.rngState).toBe(before.state.rngState);
      expect(after.state).toMatchObject({phase: 'management', turn: before.state.turn, season: before.state.season, year: before.state.year});
      if (mode === 'buy') {
        expect(after.state.market.supply).toEqual({turn: before.state.turn, purchased: {grain: 1}});
        await expect(row).toContainText('Supply: 99 this season');
      } else {
        expect(after.state.market.supply).toEqual(before.state.market.supply);
        await expect(row).toContainText(`(${grain - 1} in stock)`);
      }
      await page.screenshot({path: info.outputPath('after-trade.png'), animations: 'disabled'});
      await page.reload();
      await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
      await expect(page.getByTestId('resource-denarii')).toHaveText(`${cash}d`);
      const reloaded = await saveSnapshot(page);
      expect(reloaded.raw).toBe(after.raw);
      expect(reloaded.state.tradeCount).toBe(tradeCount + 1);
      expect(errors).toEqual([]);
    });
  }
});
