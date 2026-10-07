import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { SHOP_ITEMS } from '../../../src/data/chapel.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  test(`Chapel presets, all shop goods and timer departure at ${width}px`, async ({ page }, info) => {
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, activeTab: 'chapel', tutorialsSeen: ['chapel'] };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: /Speak with Father Anselm/ }).click();
    await page.getByRole('button', { name: /Generous \(10%\)/ }).click();
    await expect(page.getByRole('spinbutton')).toHaveValue('50');
    await page.getByRole('button', { name: 'Give', exact: true }).click();
    await expect(page.getByRole('spinbutton')).toHaveValue('');
    await page.screenshot({ path: info.outputPath('anselm-tithe.png'), animations: 'disabled' });
    await page.getByRole('button', { name: /Caedmon/ }).click();
    for (const item of SHOP_ITEMS) {
      const card = page.getByText(item.name, { exact: true }).locator('..').locator('..').locator('..');
      await card.getByRole('button', { name: 'Buy', exact: true }).click();
      await expect(card).toContainText('Owned');
      await expect(card.getByRole('button', { name: 'Buy', exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: info.outputPath('caedmon-owned.png'), animations: 'disabled' });
    const save = async () => {
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
      if (!raw) throw new Error('Missing Chapel save');
      const parsed = readV2Save(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return { raw, state: parsed.state };
    };
    const purchased = await save();
    expect(purchased.state).toMatchObject({
      denarii: 450 - SHOP_ITEMS.reduce((sum, item) => sum + item.cost, 0), churchDonation: 50,
      chapel: { inventory: SHOP_ITEMS.map(item => item.id) },
    });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    expect((await save()).raw).toBe(purchased.raw);
    await expect(page.getByText('✓ Owned', { exact: true })).toHaveCount(6);
    await page.getByRole('button', { name: /Scriptorium/ }).click();
    await expect(page.getByText('Watch the pattern carefully...', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Nave/ }).click();
    const departed = await save();
    // Real authored timer callbacks would be due by this point if unmount cleanup failed.
    await page.waitForTimeout(3100);
    expect((await save()).raw).toBe(departed.raw);
    expect(errors).toEqual([]);
  });
}
