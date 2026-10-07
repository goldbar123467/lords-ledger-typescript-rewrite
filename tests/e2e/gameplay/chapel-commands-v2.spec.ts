import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { MORAL_DILEMMAS } from '../../../src/data/chapel.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  for (const denarii of [0, 40]) {
    test(`Chapel school affordability and save at ${denarii}d/${width}px`, async ({ page }, info) => {
      const base = createInitialState(104);
      const state = { ...base, denarii, phase: 'management' as const, turn: 8, year: 2, season: 'winter' as const,
        activeTab: 'chapel', tutorialsSeen: ['chapel'], chapel: { ...base.chapel,
          dilemmasCompleted: MORAL_DILEMMAS.filter(d => d.id !== 'caedmons_proposal').map(d => d.id) } };
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(raw => {
        if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
      }, writeV2Save(state));
      await page.goto('/');
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.getByRole('button', { name: /Moral Dilemma/ }).click();
      const funded = page.getByRole('button', { name: /Fund the school/ });
      if (denarii === 0) {
        await expect(funded).toBeDisabled();
        await expect(funded).toContainText('Requires 40d');
        await page.screenshot({ path: info.outputPath('school-unaffordable.png'), animations: 'disabled' });
        await page.getByRole('button', { name: /Allow it but don't fund it/ }).click();
      } else {
        await expect(funded).toBeEnabled();
        await expect(funded).toContainText('Cost: 40d');
        await funded.click();
      }
      await page.screenshot({ path: info.outputPath('school-result.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
      if (!raw) throw new Error('Missing school save');
      const saved = readV2Save(raw);
      if (!saved.ok) throw new Error(saved.error);
      expect(saved.state).toMatchObject({ denarii: 0, chapel: {
        faith: denarii === 40 ? 65 : 55,
        piety: denarii === 40 ? 42 : 35,
        happiness: denarii === 40 ? 80 : 65,
        dilemmasCompleted: [...state.chapel.dilemmasCompleted, 'caedmons_proposal'] } });
      await page.reload();
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await expect(page.getByRole('button', { name: 'Return to Chapel' })).toBeVisible();
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
      expect(errors).toEqual([]);
    });
  }
}
