import {test, expect} from '@playwright/test';
import {createInitialState} from '../../../src/engine/gameReducer.ts';
import {MORAL_DILEMMAS, SHOP_ITEMS} from '../../../src/data/chapel.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) for (const view of ['nave', 'anselm', 'caedmon'] as const) {
  test(`Chapel lower controls reading ${view} ${width}`, async ({page}, info) => {
    const base = createInitialState(104);
    const state = {...base, phase: 'management' as const, activeTab: 'chapel', tutorialsSeen: ['chapel'], denarii: 0,
      chapel: {...base.chapel, view, dilemmasCompleted: MORAL_DILEMMAS.map(dilemma => dilemma.id),
        inventory: SHOP_ITEMS.slice(1).map(item => item.id)}};
    const input = writeV2Save(state), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: width === 390 ? 844 : 768});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), input);
    await page.goto('/'); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    if (view === 'nave') {
      const resolved = page.getByText('All resolved', {exact: true});
      await resolved.evaluate(node => node.scrollIntoView({block: 'center', behavior: 'instant'})); await page.screenshot({path: info.outputPath('nave.png')});
      await expect(page.getByRole('button', {name: /Moral Dilemma/})).toBeDisabled();
      expect(await resolved.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      expect(await page.locator('.chapel-actions button').evaluateAll(nodes => nodes.every(node => Number(getComputedStyle(node).opacity) === 1))).toBe(true);
    } else if (view === 'anselm') {
      const give = page.getByRole('button', {name: 'Give', exact: true});
      await give.evaluate(node => node.scrollIntoView({block: 'center', behavior: 'instant'})); await page.screenshot({path: info.outputPath('anselm.png')});
      await expect(give).toBeDisabled();
      expect(await give.evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
      expect(await give.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      await page.getByRole('button', {name: /Generous \(10%\)/}).click();
      await expect(page.getByRole('spinbutton', {name: 'Donation amount (denarii)', exact: true})).toHaveValue('1');
      await expect(give).toBeDisabled();
    } else {
      const item = SHOP_ITEMS[0]; if (!item) throw new Error('Missing authored first shop item.');
      const price = page.getByText(`${item.cost}d`, {exact: true});
      await price.evaluate(node => node.scrollIntoView({block: 'center', behavior: 'instant'})); await page.screenshot({path: info.outputPath('caedmon.png')});
      expect(await price.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      await expect(page.getByText('✓ Owned', {exact: true})).toHaveCount(5);
      await expect(page.getByRole('button', {name: 'Buy', exact: true})).toBeDisabled();
      await expect(page.getByText(`Requires ${item.cost}d · Treasury: 0d`, {exact: true})).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(input); expect(errors).toEqual([]);
  });
}
