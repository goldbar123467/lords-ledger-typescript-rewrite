import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import { TAB_CONFIG } from '../../../src/data/tabs.ts';
import { TUTORIALS } from '../../../src/data/tutorials.ts';

const legacy = readFileSync('tests/fixtures/legacy-normal-turn1.json', 'utf8');

async function expectInitialPresentation(guide: Locator) {
  await expect.soft(guide.getByRole('heading', { level: 2 })).toHaveCSS('font-family', /Cinzel Decorative/, { timeout: 1000 });
  await expect.soft(guide.getByRole('button', { name: 'I Understand', exact: true })).toBeInViewport({ ratio: 1, timeout: 1000 });
}

for (const width of [390, 1366]) {
  test(`first-visit tutorial contains keyboard input at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-save', raw), legacy);
    await page.goto('/');
    await page.getByRole('button', { name: 'Import old save' }).click();
    const acknowledge = page.getByRole('button', { name: 'I Understand', exact: true });
    await expect(acknowledge).toBeVisible();
    await expectInitialPresentation(page.getByRole('dialog', { name: 'The Estate', exact: true }));
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(acknowledge).toBeFocused();
    const tutorial = page.getByRole('dialog', { name: 'The Estate', exact: true });
    await expect(tutorial).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(acknowledge).toBeFocused();
    await page.screenshot({ path: info.outputPath('estate-tutorial.png') });
    await page.keyboard.press('Enter');
    await expect(tutorial).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeFocused();
    for (const { id, label } of TAB_CONFIG.slice(1)) {
      const opener = page.getByRole('button', { name: new RegExp(`${label} tab`) });
      await opener.click();
      const guide = page.getByRole('dialog', { name: TUTORIALS[id].title, exact: true });
      await expect(guide.getByRole('heading', { name: TUTORIALS[id].title, exact: true })).toBeFocused();
      await expectInitialPresentation(guide);
      await page.screenshot({ path: info.outputPath(`${id}-tutorial-start.png`) });
      for (const section of TUTORIALS[id].sections) await expect(guide.getByText(section.text, { exact: true })).toBeVisible();
      await expect(guide.getByText(TUTORIALS[id].tip, { exact: true })).toBeVisible();
      await guide.getByRole('heading', { name: TUTORIALS[id].title, exact: true }).click();
      await expect(guide).toBeVisible(); // Interior clicks must not dismiss the guide.
      if (id === 'chapel') await page.screenshot({ path: info.outputPath('chapel-tutorial-start.png') });
      if (id === 'market') {
        const load = await page.locator('button[aria-label="Load saved game"]').boundingBox();
        if (!load) throw new Error('Missing background Load control');
        await page.mouse.click(load.x + load.width / 2, load.y + load.height / 2);
        await expect(opener).toHaveAttribute('aria-current', 'page'); // Backdrop dismissal must not load the old Estate state.
      } else if (id === 'chronicle') await page.mouse.click(0, 0);
      else if (id === 'forge') await acknowledge.click();
      else await page.keyboard.press('Escape');
      await expect(guide).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    await page.getByRole('button', { name: 'Save game' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(acknowledge).toHaveCount(0);
    for (const { label } of TAB_CONFIG) {
      await page.getByRole('button', { name: new RegExp(`${label} tab`) }).click();
      await expect(acknowledge).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
    expect(errors).toEqual([]);
  });
}

test('enlarged tutorial content stays scrollable inside a short viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-save', raw), legacy);
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.getByRole('button', { name: 'Import old save' }).click();
  const dialog = page.getByRole('dialog', { name: 'The Estate', exact: true });
  await expect(dialog.getByRole('heading', { name: 'The Estate', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('enlarged-start.png') });
  await page.keyboard.press('Tab');
  const action = dialog.getByRole('button', { name: 'I Understand', exact: true });
  await expect(action).toBeFocused();
  await expect(action).toBeInViewport({ ratio: 1 });
  const geometry = await dialog.evaluate(element => ({
    top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
  }));
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(420);
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  await page.screenshot({ path: info.outputPath('enlarged-action.png') });
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
});
