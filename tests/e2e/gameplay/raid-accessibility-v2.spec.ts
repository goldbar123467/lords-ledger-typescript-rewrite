import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixture = JSON.parse(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
function luminance(color: string) {
  const values = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = values;
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Invalid color: ${color}`);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
for (const type of ['criminal', 'scottish']) {
  test(`${type} raid contains keyboard focus and preserves its mandatory action`, async ({ page }) => {
    const state = { ...fixture, phase: 'raid_warning' as const,
      military: { ...fixture.military, scribesNoteSeen: Object.fromEntries(Object.keys(fixture.military.scribesNoteSeen).map(key => [key, true])) },
      raids: { ...fixture.raids, criminalScribesNoteSeen: true, scottishScribesNoteSeen: true,
        activeRaid: { type, phase: 'warning' as const } } };
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, JSON.stringify({ format: 'lords-ledger', version: 2, state }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const defend = page.getByRole('button', { name: 'Defend the Estate' });
    await defend.focus();
    for (const key of ['Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => document.activeElement?.closest('.raid-modal') !== null)).toBe(true);
    }
    await defend.focus();
    await page.keyboard.press('Escape');
    await page.locator('.game-header [aria-label="Save game"]').evaluate(button => button.focus());
    await expect(defend).toBeFocused();
    const save = page.locator('.raid-modal').getByRole('button', { name: 'Save game', exact: true });
    await save.click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lords-ledger-v2-save') ?? '{}').state.phase)).toBe('raid_warning');
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await defend.click();
    const continuation = page.locator('.raid-modal').getByRole('button', { name: 'Continue', exact: true });
    await expect(continuation).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(continuation).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(continuation).toBeVisible();
    await save.click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lords-ledger-v2-save') ?? '{}').state);
    expect(saved.phase).toBe('raid_result');
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(continuation).toBeVisible();
    await save.click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lords-ledger-v2-save') ?? '{}').state.raids.activeRaid.result)).toEqual(saved.raids.activeRaid.result);
    await continuation.click();
    await expect(page.getByRole('button', { name: 'See What Happens Next' })).toBeVisible();
  });

  test(`${type} raid text and action fit enlarged narrow and short screens`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    const state = { ...fixture, phase: 'raid_warning' as const, garrison: 0,
      military: { ...fixture.military, garrison: { levy: 0, menAtArms: 0, knights: 0 },
        scribesNoteSeen: Object.fromEntries(Object.keys(fixture.military.scribesNoteSeen).map(key => [key, true])) },
      raids: { ...fixture.raids, criminalScribesNoteSeen: true, scottishScribesNoteSeen: true,
        activeRaid: { type, phase: 'warning' as const } } };
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, JSON.stringify({ format: 'lords-ledger', version: 2, state }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    for (const action of ['Defend the Estate', 'Continue']) {
      const button = page.getByRole('button', { name: action, exact: true });
      await expect(button).toBeVisible();
      const geometry = await button.evaluate(element => {
        const r = element.getBoundingClientRect();
        const heading = element.closest('.raid-modal, .fixed')?.querySelector('h2');
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === element,
          headingFits: heading ? heading.scrollWidth <= heading.clientWidth : false };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(390);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(600);
      expect(geometry.hit).toBe(true);
      expect(geometry.headingFits).toBe(true);
      const colors = await page.locator('.raid-modal h2, .raid-outcome').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
      for (const color of colors) {
        const light = luminance(color), dark = luminance('rgb(40, 35, 24)');
        expect((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
      await button.click();
    }
  });

  test(`${type} scrolled defense comparison fits doubled phone text`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = { ...fixture, phase: 'raid_warning' as const,
      raids: { ...fixture.raids, activeRaid: { type, phase: 'warning' as const } } };
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), JSON.stringify({ format: 'lords-ledger', version: 2, state }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'html { font-size:200% !important; }' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    const content = page.locator('.raid-modal .overflow-y-auto');
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: testInfo.outputPath('scrolled-comparison-390.png') });
    const bounds = await content.boundingBox();
    if (!bounds) throw new Error('Missing raid scroll region');
    for (const text of ['Defense Rating', 'Required']) {
      const label = page.getByText(text, { exact: true });
      const box = await label.boundingBox();
      if (!box) throw new Error(`Missing ${text}`);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    for (const value of await page.locator('.raid-defense-values > div > span').all()) {
      const box = await value.boundingBox();
      if (!box) throw new Error('Missing defense value');
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
  });
}
