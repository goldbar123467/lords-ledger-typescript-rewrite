import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import { MORAL_DILEMMAS } from '../../../src/data/chapel.ts';

for (const width of [390, 1366]) {
  test(`Chapel authored tithe, shop and dilemma survive save at ${width}px`, async ({ page }, info) => {
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, turn: 8, year: 2, season: 'winter' as const, activeTab: 'chapel',
      tutorialsSeen: ['chapel'], chapel: { ...base.chapel,
        dilemmasCompleted: MORAL_DILEMMAS.filter(dilemma => dilemma.id !== 'starving_widow').map(dilemma => dilemma.id) } };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: /Speak with Father Anselm/ }).click();
    await page.getByRole('spinbutton').fill('50');
    await page.getByRole('button', { name: 'Give', exact: true }).click();
    await page.getByRole('button', { name: /Caedmon/, exact: false }).click();
    const item = page.getByText('Illuminated Letter', { exact: true }).locator('..').locator('..').locator('..');
    await item.getByRole('button', { name: 'Buy', exact: true }).click();
    await expect(item).toContainText('Owned');
    await page.getByRole('button', { name: /Nave/ }).click();
    await page.getByRole('button', { name: /Moral Dilemma/ }).click();
    await expect(page.getByRole('heading', { name: 'The Starving Widow' })).toBeVisible();
    await page.getByRole('button', { name: /Show mercy/ }).click();
    await expect(page.getByText(/You wave away the fine/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('chapel-dilemma.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!raw) throw new Error('Chapel save missing.');
    const saved = readV2Save(raw);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.state).toMatchObject({ denarii: 425, churchDonation: 50,
      chapel: { faith: 79, piety: 51, happiness: 68, inventory: ['illuminated_letter'],
        dilemmasCompleted: [...state.chapel.dilemmasCompleted, 'starving_widow'] } });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await expect(page.getByText(/You wave away the fine/)).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const resumedRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!resumedRaw) throw new Error('Restored Chapel save missing.');
    const resumed = readV2Save(resumedRaw);
    expect(resumed).toEqual(saved);
    expect(errors).toEqual([]);
  });
}
