import { expect, test, type Page } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

async function loadPeople(page: Page, width: number, rootSize: number) {
  await page.setViewportSize({ width, height: 844 });
  const base = createInitialState(104);
  const state = { ...base, phase: 'management', activeTab: 'people', tutorialsSeen: ['people'],
    people: { ...base.people, notableFamilies: base.people.notableFamilies.map(f =>
      f.id === 'miller' ? { ...f, present: false, turnsGone: 3, loyalty: 0 } : f) } };
  const raw = writeV2Save(state);
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
  await page.goto('/');
  await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, rootSize);
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  return raw;
}

for (const width of [390, 1366]) for (const rootSize of [16, 24]) {
  test(`People departure remains readable at ${width}px root ${rootSize}`, async ({ page }, info) => {
    const raw = await loadPeople(page, width, rootSize);
    const status = page.getByText('Gone for 3 seasons.', { exact: true });
    const card = status.locator('..');
    await status.scrollIntoViewIfNeeded();
    await expect(card).toHaveCSS('opacity', '1');
    const metrics = await status.evaluate(e => ({ color: getComputedStyle(e).color, size: parseFloat(getComputedStyle(e).fontSize) }));
    expect(metrics.size).toBeGreaterThanOrEqual(rootSize * 0.875);
    const rgb = metrics.color.match(/[\d.]+/g)?.map(Number);
    if (!rgb || rgb.length !== 3) throw new Error('Expected opaque departure text');
    const luminance = (channels: number[]) => channels.reduce((sum, c, i) => {
      const v = c / 255;
      return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][i] ?? 0);
    }, 0);
    // Both backing-gradient endpoints, with opacity separately asserted above.
    for (const background of [[35, 30, 25], [28, 24, 20]]) {
      expect((luminance(rgb) + 0.05) / (luminance(background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: info.outputPath('departure.png'), animations: 'disabled' });
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`People native keyboard labor stays above footer at ${width}px root ${rootSize}`, async ({ page }, info) => {
    await loadPeople(page, width, rootSize);
    for (const name of ['Farming', 'Garrison Duty', 'Chapel Work']) {
      const slider = page.getByRole('slider', { name: `${name} allocation`, exact: true });
      for (let i = 0; i < 80 && !(await slider.evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(slider).toBeFocused();
      await expect.poll(() => slider.evaluate(e => {
        const r = e.getBoundingClientRect();
        const footer = document.querySelector('.sticky.bottom-0')?.getBoundingClientRect();
        const header = document.querySelector('.game-header');
        const top = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
        return r.top >= top + 3 && r.bottom <= (footer?.top ?? innerHeight) - 3 &&
          e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
      await expect(slider).toHaveCSS('outline-style', 'solid');
      await expect(slider).toHaveCSS('outline-width', '3px');
      if (name === 'Farming') await page.screenshot({ path: info.outputPath('farming-focus.png'), animations: 'disabled' });
      await page.keyboard.press('ArrowRight');
      await expect(slider).toHaveValue(name === 'Farming' ? '75' : name === 'Garrison Duty' ? '5' : '10');
    }
  });
}
