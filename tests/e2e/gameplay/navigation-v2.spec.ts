import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TAB_CONFIG } from '../../../src/data/tabs.ts';

function luminance(color: string) {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Invalid computed color: ${color}`);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function expectVisibleTab(button: Locator) {
  // scrollWidth is rounded to an integer; allow at most half a CSS pixel at the edge.
  await expect.poll(() => button.evaluate(element => {
    const bar = element.closest('.tab-nav');
    if (!bar) throw new Error('Tab has no navigation container');
    const tab = element.getBoundingClientRect();
    const viewport = bar.getBoundingClientRect();
    return Math.max(viewport.left - tab.left, tab.right - viewport.right, -tab.top, tab.bottom - innerHeight);
  })).toBeLessThanOrEqual(0.5);
}

for (const width of [390, 640, 1024, 1366]) {
  test(`navigation labels and keyboard switching remain usable at ${width}px`, async ({ page }, info) => {
    const legacy = readFileSync('tests/fixtures/legacy-normal-turn1.json', 'utf8');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-save', raw), legacy);
    await page.goto('/');
    await page.getByRole('button', { name: 'Import old save' }).click();
    await page.getByRole('button', { name: 'I Understand', exact: true }).click();
    await page.mouse.move(0, 0);
    const bar = page.locator('.tab-nav');
    await expect(bar.getByRole('button')).toHaveCount(9);
    const styles = await bar.evaluate(element => [...element.querySelectorAll('button')].map(button => {
      const style = getComputedStyle(button);
      const label = [...button.querySelectorAll('span')].find(span => getComputedStyle(span).display !== 'none');
      const buttonBox = button.getBoundingClientRect();
      const labelBox = label?.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label'), foreground: style.color,
        background: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(element).backgroundColor : style.backgroundColor,
        fontSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
        height: button.getBoundingClientRect().height,
        labelOverflow: labelBox ? Math.max(buttonBox.left - labelBox.left, labelBox.right - buttonBox.right) : Infinity,
      };
    }));
    for (const style of styles) {
      const colors = [luminance(style.foreground), luminance(style.background)];
      const contrast = (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05);
      expect.soft(contrast, `${style.name} contrast`).toBeGreaterThanOrEqual(4.5);
      expect.soft(style.fontSize, `${style.name} label size`).toBeGreaterThanOrEqual(14);
      expect.soft(style.labelOverflow, `${style.name} label fits its button`).toBeLessThanOrEqual(0.5);
      expect(style.height, `${style.name} target height`).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath('navigation-initial.png') });
    for (const { id, label } of TAB_CONFIG) {
      const button = bar.getByRole('button', { name: new RegExp(`^${label} tab`) });
      await button.focus();
      await page.keyboard.press('Enter');
      const guide = page.getByRole('button', { name: 'I Understand', exact: true });
      if (id !== 'estate') await guide.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(button).toBeFocused();
      await expectVisibleTab(button);
    }
    await page.getByRole('button', { name: 'Simulate this season' }).click();
    await expect(page.getByRole('group', { name: 'Choose your response' })).toBeVisible();
    for (const button of await bar.getByRole('button').all()) await expect(button).toBeDisabled();
    await expectVisibleTab(bar.getByRole('button', { name: /^Chronicle tab/ }));
    await page.screenshot({ path: info.outputPath('navigation-locked.png') });
    await page.getByRole('button', { name: 'Save game' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByRole('group', { name: 'Choose your response' })).toBeVisible();
    for (const button of await bar.getByRole('button').all()) await expect(button).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
    expect(errors).toEqual([]);
  });
}

test('the active section stays revealed when the navigation resizes', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /Normal.*standard experience/i }).click();
  await page.getByRole('button', { name: 'I Understand', exact: true }).click();
  const chronicle = page.getByRole('button', { name: /^Chronicle tab/ });
  await chronicle.click();
  await page.getByRole('button', { name: 'I Understand', exact: true }).click();
  const simulate = page.getByRole('button', { name: 'Simulate this season' });
  await simulate.focus(); // The browser must not reveal the tab merely because it is focused.
  for (const width of [320, 640, 1024, 1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(chronicle).toHaveAttribute('aria-current', 'page');
    await expectVisibleTab(chronicle);
    await expect(simulate).toBeFocused();
    await page.screenshot({ path: info.outputPath(`chronicle-resized-${width}.png`) });
  }
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');
  await expect(chronicle.locator('span')).toHaveCSS('font-size', '28px');
  await expectVisibleTab(chronicle); // Observe a growing active button as well as the container.
  await expect(simulate).toBeFocused();
  await page.screenshot({ path: info.outputPath('chronicle-enlarged.png') });
  expect(errors).toEqual([]);
});

test('a seasonal decision is brought into view after a narrow-screen management tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Normal.*standard experience/i }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /^Forge tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: 'Simulate this season' }).click();
  await expect(page.getByRole('group', { name: 'Choose your response' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('h3').first()).toBeInViewport();
  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector('.tab-nav');
    const active = bar?.querySelector('[aria-current="page"]');
    if (!bar || !active) return false;
    const viewport = bar.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    return active.getAttribute('aria-label')?.startsWith('Chronicle tab') &&
      tab.left >= viewport.left && tab.right <= viewport.right;
  })).toBe(true);
});
