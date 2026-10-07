import type {GameSnapshot} from '../../../src/save/saveGame.ts';
import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) for (const walls of [1, 3]) {
  test(`People labor wording stays accurate with walls${walls} at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    let state: GameSnapshot = { ...createInitialState(104), phase: 'management' as const, activeTab: 'people', tutorialsSeen: ['people'] };
    if (walls === 3) for (let i = 0; i < 2; i++) state = gameReducer(state, { type: 'UPGRADE_FORTIFICATION', payload: { track: 'walls' } });
    expect(state.military.walls).toBe(walls);
    if (walls === 3) expect(state.denarii).toBe(130);
    const raw = writeV2Save(state);
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    if (walls === 3) {
      const note = page.getByRole('heading', { name: /Scribe's Note/ });
      await expect(note).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(note).toHaveCount(0);
    }
    const advice = page.getByText('No families are assigned to garrison duty. Hired soldiers and fortifications are managed in Military.', { exact: true });
    await expect(advice).toBeVisible();
    await expect(page.getByText(/village.*undefended/i)).toHaveCount(0);
    await advice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('accurate-advice.png'), animations: 'disabled' });
    const slider = page.getByRole('slider', { name: 'Garrison Duty allocation', exact: true });
    await slider.scrollIntoViewIfNeeded();
    await expect(page.getByText('0 families on guard duty', { exact: false })).toBeVisible();
    await page.screenshot({ path: info.outputPath('accurate-labor.png'), animations: 'disabled' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('5');
    await expect(page.getByText('1 family on guard duty', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!saved) throw new Error('No saved labor change');
    const envelope: unknown = JSON.parse(saved);
    expect(envelope).toMatchObject({ state: { denarii: state.denarii, garrison: 5,
      people: { laborGarrison: 5 }, military: state.military, rngState: state.rngState } });
    expect(errors).toEqual([]);
  });
}
