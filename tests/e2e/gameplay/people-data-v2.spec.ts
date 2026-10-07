import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) {
  test(`People tax/labor and family state survives reload at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const state = { ...createInitialState(104), phase: 'management' as const, activeTab: 'people', tutorialsSeen: ['people'] };
    const raw = writeV2Save(state);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Notable Families', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Set tax rate to Crushing/ }).click();
    const farming = page.getByRole('slider', { name: /Farming.*allocation/i });
    await farming.focus();
    await page.keyboard.press('ArrowRight');
    await expect(farming).toHaveValue('75');
    await page.screenshot({ path: info.outputPath('people-families.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!saved) throw new Error('No People save');
    const parsed = readV2Save(saved);
    if (!parsed.ok) throw new Error(parsed.error);
    const envelope: unknown = JSON.parse(saved);
    expect(envelope).toMatchObject({ state: { taxRate: 'crushing', people: { laborFarming: 75, notableFamilies: state.people.notableFamilies, tiers: state.people.tiers } } });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await expect(farming).toHaveValue('75');
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);
    expect(errors).toEqual([]);
  });
}
