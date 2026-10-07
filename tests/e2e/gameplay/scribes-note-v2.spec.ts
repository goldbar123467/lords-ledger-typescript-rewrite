import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readLegacySave, readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import seasonalEvents from '../../../src/data/seasonalEvents.ts';

const legacy = readFileSync('tests/fixtures/legacy-normal-turn1.json', 'utf8');
const saveKey = 'lords-ledger-v2-save';

async function start(page: Page) {
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-save', raw), legacy);
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
}

async function savedState(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), saveKey);
  if (!raw) throw new Error('Missing saved game');
  const result = readV2Save(raw);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const width of [390, 1366]) {
  test(`Scribe's Note keeps keyboard input away from background Load at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await start(page);
    await page.getByRole('button', { name: 'Simulate this season' }).click();
    const choices = page.getByRole('group', { name: 'Choose your response' });
    await expect(choices).toBeVisible();
    const before = await savedState(page);
    const pendingRaw = await page.evaluate(key => localStorage.getItem(key), saveKey);
    await choices.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    const note = page.locator('.fixed.inset-0.z-50').filter({
      has: page.getByRole('heading', { name: "Scribe's Note" }),
    });
    await expect(note).toBeVisible();
    await expect(note.getByRole('heading', { name: "Scribe's Note" })).toBeFocused();
    // The original implementation reached hidden Load after these three Tab presses.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(note.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
    await expect(page.getByRole('dialog', { name: "Scribe's Note" })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(note.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath('contained-note.png') });
    await page.keyboard.press('Enter');
    await expect(note).toHaveCount(0);
    const continuation = page.getByRole('button', { name: 'See What Happens Next' });
    await expect(continuation).toBeFocused();
    expect(await page.evaluate(key => localStorage.getItem(key), saveKey)).toBe(pendingRaw);
    const after = await savedState(page);
    expect(after.phase).toBe('seasonal_resolve');
    expect(after.denarii).toBe(before.denarii - 40);
    expect(after.food).toBe(before.food - 24);
    expect(after.garrison).toBe(before.garrison + 1);
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(note).toHaveCount(0);
    await continuation.click();
    await expect(choices).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
    expect(errors).toEqual([]);
  });
}

test('a loaded long note scrolls, dismisses with Escape and restores the continuation', async ({ page }, info) => {
  // Short/narrow viewport and enlarged text are a stress case, not browser-zoom evidence.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = readLegacySave(legacy);
  if (!result.ok) throw new Error(result.error);
  const event = seasonalEvents.spring[0];
  const longNote = Array(12).fill(event.scribesNote).join(' ');
  const raw = writeV2Save({ ...result.state, phase: 'seasonal_resolve' as const, currentEvent: event, scribesNote: longNote });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: saveKey, value: raw });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const note = page.getByRole('dialog', { name: "Scribe's Note" });
  await expect(note.getByRole('heading')).toBeFocused();
  await expect(note.locator('p')).toHaveText(longNote);
  const geometry = await note.evaluate(element => ({
    top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
    width: element.getBoundingClientRect().width, scroll: element.scrollHeight, height: element.clientHeight,
  }));
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(420);
  expect(geometry.width).toBeLessThanOrEqual(390);
  expect(geometry.scroll).toBeGreaterThan(geometry.height);
  await page.screenshot({ path: info.outputPath('long-note-start.png') });
  await page.keyboard.press('Tab');
  await expect(note.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  await expect(note.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('long-note-action.png') });
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See What Happens Next' })).toBeFocused();
  await savedState(page);
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(note).toHaveCount(0);
});

test('Market note returns focus to its opener after keyboard and pointer dismissal', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: /Market tab/ }).click();
  await page.getByRole('button', { name: 'I Understand' }).click();
  const opener = page.getByRole('button', { name: 'The Scribe has notes about medieval markets...' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const note = page.getByRole('dialog', { name: "Scribe's Note" });
  await expect(note.getByRole('heading')).toBeFocused();
  await expect(page.getByRole('button', { name: 'I Understand' })).toHaveCount(0);
  // Native modal also rejects scripted focus on a background control.
  await page.locator('button[aria-label="Load saved game"]').focus();
  await expect(note.getByRole('heading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await note.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(opener).toBeFocused();
});

test('a loaded management note precedes the first-visit tutorial', async ({ page }) => {
  const result = readLegacySave(legacy);
  if (!result.ok) throw new Error(result.error);
  const raw = writeV2Save({ ...result.state, scribesNote: seasonalEvents.spring[0].scribesNote, tutorialsSeen: [] });
  await page.addInitScript(value => localStorage.setItem('lords-ledger-v2-save', value), raw);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const note = page.getByRole('dialog', { name: "Scribe's Note" });
  await expect(note.getByRole('heading')).toBeFocused();
  await expect(page.getByRole('button', { name: 'I Understand' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: 'I Understand' }).click();
  await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
});

test('the cellar note returns keyboard focus to Ready without starting the timer', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: /Map tab/ }).click();
  await page.getByRole('button', { name: 'I Understand' }).click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', { name: /Rats in the Cellar/ }).click();
  const note = page.getByRole('dialog', { name: "Scribe's Note" });
  await expect(note.getByRole('heading')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ready!', exact: true })).toBeFocused();
  expect((await savedState(page)).phase).toBe('management');
});
