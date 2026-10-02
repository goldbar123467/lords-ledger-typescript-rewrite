import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { readV2Save } from '../../../src/save/saveGame.ts';

const legacy = readFileSync('tests/fixtures/legacy-normal-turn1.json', 'utf8');
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('The 2.0 save is missing');
  const result = readV2Save(raw);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const width of [390, 1366]) {
  test(`event labels and keyboard choices preserve saved consequences at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-save', raw), legacy);
    await page.goto('/');
    await page.getByRole('button', { name: 'Import old save' }).click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await page.getByRole('button', { name: 'Simulate this season' }).click();
    const choices = page.getByRole('group', { name: 'Choose your response' }).getByRole('button');
    await expect(page.getByRole('heading', { name: 'The Runaway Serf', exact: true })).toBeVisible();
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toHaveAccessibleName('Option 1: Send men to bring Wat back to the estate. Expected effects: Denarii decrease, Food decrease, Garrison increase.');
    await expect(choices.nth(1)).toHaveAccessibleName('Option 2: Let Wat go — and tell the other serfs you are a fair lord. Expected effects: Food increase, Garrison decrease, Denarii increase.');
    const before = await save(page);
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(choices).toHaveCount(2);
    await choices.first().focus();
    await page.keyboard.press('Enter');
    const note = page.locator('.fixed.inset-0.z-50').filter({ has: page.getByRole('heading', { name: "Scribe's Note" }) });
    await expect(note).toBeVisible();
    // The separate Scribe's Note regression covers modal keyboard containment.
    await note.getByRole('button', { name: 'Continue', exact: true }).click();
    const after = await save(page);
    expect(after.phase).toBe('seasonal_resolve');
    expect(after.denarii).toBe(before.denarii - 40);
    expect(after.food).toBe(before.food - 24);
    expect(after.inventory.grain).toBe(before.inventory.grain - 24);
    expect(after.garrison).toBe(before.garrison + 1);
    expect(after.military.morale).toBe(before.military.morale + 9);
    const continuing = page.getByRole('button', { name: 'See What Happens Next', exact: true });
    await continuing.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(continuing).toBeFocused();
    await expect(continuing).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: info.outputPath('resolve-keyboard.png') });
    await continuing.press('Enter');
    await expect(page.getByText('An Event Unfolds', { exact: true })).toBeVisible();
    await expect(choices).toHaveCount(3);
    expect((await save(page)).phase).toBe('random_event');
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
    expect(errors).toEqual([]);
  });
}
