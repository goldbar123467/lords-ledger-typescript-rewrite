import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  test(`Chapel donation pays the entered amount at ${width}px`, async ({ page }, info) => {
    const state = { ...createInitialState(104), phase: 'management' as const, activeTab: 'chapel', tutorialsSeen: ['chapel'] };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: /Speak with Father Anselm/ }).click();
    const input = page.getByRole('spinbutton', { name: 'Donation amount (denarii)' });
    await expect(input).toHaveAttribute('step', 'any');
    const give = page.getByRole('button', { name: 'Give', exact: true });
    await input.fill('2.5');
    await page.screenshot({ path: info.outputPath('entered-donation.png'), animations: 'disabled' });
    await give.click();
    await expect(input).toHaveValue('');
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!raw) throw new Error('Missing donation save');
    const saved = readV2Save(raw);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.state.denarii).toBe(497.5);
    expect(saved.state).toMatchObject({ churchDonation: 2.5 });
    expect(saved.state.chapel?.gameLog?.at(-1)?.text).toBe('Tithed 2.5d to Father Anselm (none).');
    for (const value of ['', '0', '-1', '498']) {
      await input.fill(value);
      await expect(give).toBeDisabled();
    }
    await input.fill('0.5');
    await expect(give).toBeEnabled();
    await give.click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const finalRaw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!finalRaw) throw new Error('Missing second donation save');
    const final = readV2Save(finalRaw);
    if (!final.ok) throw new Error(final.error);
    expect(final.state.denarii).toBe(497);
    expect(final.state).toMatchObject({ churchDonation: 3 });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(finalRaw);
    expect(errors).toEqual([]);
  });
}
