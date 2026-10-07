import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { getInitialTiers, pickFeedEvents } from '../../../src/data/people.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) {
  test(`People saved-state load resets all labor controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const base = createInitialState(104);
    const families = base.people.notableFamilies.map(f => f.id === 'miller' ? { ...f, present: false, turnsGone: 3, loyalty: 0 } : f);
    const state = { ...base, phase: 'management' as const, activeTab: 'people', tutorialsSeen: ['people'],
      people: { ...base.people, notableFamilies: families, villageFeed: pickFeedEvents('spring', 57, 1, 20, families, () => 0) } };
    const raw = writeV2Save(state);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/');
    const load = page.getByRole('button', { name: 'Load saved game', exact: true });
    await load.click();
    await expect(page.getByText('Gone for 3 seasons.', { exact: true })).toBeVisible();
    await expect(page.getByText(state.people.villageFeed[0]?.text ?? 'Missing authored event', { exact: true })).toBeVisible();
    await page.getByText('Morale Breakdown', { exact: true }).click();
    await expect(page.getByText('Family Loyalty:', { exact: true })).toBeVisible();
    await page.getByText('✦ Historical Context', { exact: true }).click();
    await page.screenshot({ path: info.outputPath('families-and-feed.png'), fullPage: true, animations: 'disabled' });
    for (const name of ['Low', 'Medium', 'High', 'Crushing']) {
      const button = page.getByRole('button', { name: new RegExp('Set tax rate to '+name) });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    const farm = page.getByRole('slider', { name: 'Farming allocation', exact: true });
    const duty = page.getByRole('slider', { name: 'Garrison Duty allocation', exact: true });
    const church = page.getByRole('slider', { name: 'Chapel Work allocation', exact: true });
    for (const [slider, expected] of [[farm, '75'], [duty, '5'], [church, '10']] as const) {
      await slider.focus(); await page.keyboard.press('ArrowRight'); await expect(slider).toHaveValue(expected);
    }
    // Reload the untouched slot while this same People component is still mounted.
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await load.click();
    await expect(farm).toHaveValue('70'); await expect(duty).toHaveValue('0'); await expect(church).toHaveValue('5');
    await expect(page.getByRole('button', { name: /Set tax rate to Medium/ })).toHaveAttribute('aria-pressed', 'true');
    await church.focus(); await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!saved) throw new Error('Missing People save');
    const parsed = readV2Save(saved); if (!parsed.ok) throw new Error(parsed.error);
    const envelope: unknown = JSON.parse(saved);
    expect(envelope).toMatchObject({ state: { taxRate: 'medium', people: { laborFarming: 70, laborGarrison: 0, laborChurch: 10, notableFamilies: families } } });
    expect(errors).toEqual([]);
  });
  test(`People missing-tier display conserves four population at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const state = { ...createInitialState(104), phase: 'management' as const, population: 4, activeTab: 'people', tutorialsSeen: ['people'], people: {} };
    const raw = writeV2Save(state);
    expect(readV2Save(raw).ok).toBe(true);
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    for (const [label, count] of [['Serfs', 1], ['Freemen', 1], ['Skilled Workers', 2]] as const) {
      const row = page.getByText(label, { exact: true }).locator('..');
      await expect(row.getByText(String(count), { exact: true })).toBeVisible();
    }
    expect(getInitialTiers(4)).toEqual({ serfs: 1, freemen: 1, skilled: 2 });
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await page.screenshot({ path: info.outputPath('partial-people.png'), animations: 'disabled' });
  });
}
