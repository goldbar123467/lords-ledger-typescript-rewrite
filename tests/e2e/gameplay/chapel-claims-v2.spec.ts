import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { MORAL_DILEMMAS } from '../../../src/data/chapel.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  test(`Chapel descriptions agree with herbs and Bishop effects at ${width}px`, async ({ page }, info) => {
    const base = createInitialState(104);
    const state = { ...base, denarii: 100, phase: 'management' as const, turn: 8, year: 2, season: 'winter' as const,
      activeTab: 'chapel', tutorialsSeen: ['chapel'], chapel: { ...base.chapel,
        dilemmasCompleted: MORAL_DILEMMAS.filter(d => d.id !== 'bishops_demand').map(d => d.id) } };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: /Visit Brother Caedmon/ }).click();
    const herbs = page.getByText('Monastery Herbs', { exact: true }).locator('..').locator('..').locator('..');
    await expect(herbs).toContainText('Adds 5 food to your stores');
    await expect(herbs).not.toContainText('Heals');
    await page.screenshot({ path: info.outputPath('herbs-claim.png'), animations: 'disabled' });
    await herbs.getByRole('button', { name: 'Buy', exact: true }).click();
    await expect(herbs).toContainText('Owned');
    await page.getByRole('button', { name: /Nave/ }).click();
    await page.getByRole('button', { name: /Moral Dilemma/ }).click();
    await expect(page.getByText(/He demands an extra tithe/)).toContainText('60 denarii');
    await expect(page.getByText(/He demands an extra tithe/)).not.toContainText('10%');
    await expect(page.getByRole('button', { name: /Pay in full/ })).toContainText('Cost: 60d');
    await expect(page.getByRole('button', { name: /Negotiate/ })).toContainText('Cost: 30d');
    await page.screenshot({ path: info.outputPath('bishop-claim.png'), animations: 'disabled' });
    await page.getByRole('button', { name: /Pay in full/ }).click();
    await expect(page.getByText(/You send the full amount/)).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!raw) throw new Error('Missing claims save');
    const saved = readV2Save(raw);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.state).toMatchObject({ denarii: 30, food: 205, population: 20,
      chapel: { faith: 70, piety: 48, happiness: 55, inventory: ['monastery_herbs'],
        dilemmasCompleted: [...state.chapel.dilemmasCompleted, 'bishops_demand'] } });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByText(/You send the full amount/)).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    expect(errors).toEqual([]);
  });
}
