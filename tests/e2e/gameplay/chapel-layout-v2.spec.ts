import { expect, test, type Page } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { MANUSCRIPT_FACTS, SHOP_ITEMS } from '../../../src/data/chapel.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';

async function tabTo(page: Page, text: string) {
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(label => document.activeElement?.textContent?.includes(label), text)) return;
  }
  throw new Error(`Native Tab never reached ${text}`);
}
async function unobscured(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) throw new Error('Missing focus');
    const box = active.getBoundingClientRect();
    const header = document.querySelector('.game-header');
    const top = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
    const bottom = document.querySelector('.sticky.bottom-0')?.getBoundingClientRect().top ?? innerHeight;
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.top >= top && box.bottom <= bottom && !!hit && active.contains(hit);
  });
}
for (const width of [390, 1366]) {
  for (const view of ['nave', 'caedmon', 'manuscript']) {
    test(`Chapel readable ${view} and enlarged keyboard layout at ${width}px`, async ({ page }, info) => {
      const base = createInitialState(104);
      const pattern = [0, 1, 2, 3, 4, 5];
      const fact = MANUSCRIPT_FACTS[0];
      if (!fact) throw new Error('Missing authored manuscript fact');
      const state = { ...base, phase: 'management' as const, activeTab: 'chapel', denarii: 0, tutorialsSeen: ['chapel'],
        chapel: { ...base.chapel, view, inventory: SHOP_ITEMS.filter(item => item.id !== 'beeswax_candles').map(item => item.id),
          ...(view === 'manuscript' ? { msPhase: 'success', msRound: 4, msPattern: pattern,
            msPlayerInput: pattern, msReward: 20, msFact: fact } : {}) } };
      await page.setViewportSize({ width, height: 768 });
      await page.addInitScript(raw => {
        if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
      }, writeV2Save(state));
      await page.goto('/');
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.screenshot({ path: info.outputPath('normal.png'), animations: 'disabled' });
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
      await page.screenshot({ path: info.outputPath('enlarged.png'), animations: 'disabled' });
      if (view === 'nave') {
        const nav = page.getByRole('button', { name: /Scriptorium/, exact: false }).first();
        const layout = await nav.evaluate(button => {
          const parent = button.parentElement;
          if (!parent) throw new Error('Missing navigation');
          return { width: parent.clientWidth, content: parent.scrollWidth };
        });
        expect(layout.content).toBeLessThanOrEqual(layout.width);
        await tabTo(page, 'Speak with Father Anselm');
        expect(await unobscured(page)).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.getByRole('spinbutton', { name: 'Donation amount (denarii)' })).toBeVisible();
        await tabTo(page, 'Modest (5%)');
        expect(await unobscured(page)).toBe(true);
      } else if (view === 'caedmon') {
        const owned = page.getByText('✓ Owned', { exact: true });
        await expect(owned).toHaveCount(5);
        const faded = await owned.first().evaluate(node => {
          let current: Element | null = node;
          while (current) {
            if (Number(getComputedStyle(current).opacity) < 1) return true;
            current = current.parentElement;
          }
          return false;
        });
        expect(faded).toBe(false);
        await expect(page.getByRole('button', { name: 'Buy', exact: true })).toBeDisabled();
        await expect(page.getByText('Requires 8d · Treasury: 0d', { exact: true })).toBeVisible();
        await page.getByText('✦ Monks and Commerce', { exact: true }).scrollIntoViewIfNeeded();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(overflow).toBe(false);
      } else {
        await tabTo(page, 'Manuscript Copied Successfully!');
        const result = page.getByRole('region', { name: 'Manuscript result' });
        await expect(result).toBeFocused();
        expect(await unobscured(page)).toBe(true);
        await expect(result).toContainText(fact);
        await page.keyboard.press('PageDown');
        await expect.poll(() => result.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        for (const name of ['Try Again', 'Return to Chapel']) {
          const action = page.getByRole('button', { name, exact: true });
          const readable = await action.evaluate(button => {
            const style = getComputedStyle(button);
            const context = document.createElement('canvas').getContext('2d');
            if (!context) throw new Error('Missing text measurement context');
            context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
            const text = button.textContent?.trim().toUpperCase() ?? '';
            const needed = Math.max(...text.split(/\s+/).map(word => context.measureText(word).width +
              Math.max(0, word.length - 1) * (parseFloat(style.letterSpacing) || 0)));
            const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            return available >= needed;
          });
          expect(readable, name + ' must fit whole words').toBe(true);
        }
        await tabTo(page, 'Return to Chapel');
        expect(await unobscured(page)).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: 'The Chapel of St. Dunstan' })).toBeVisible();
      }
    });
  }
}
