import { expect, test, type Page } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { MORAL_DILEMMAS } from '../../../src/data/chapel.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

async function tabTo(page: Page, label: string) {
  for (let step = 0; step < 45; step++) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(text => document.activeElement?.textContent?.includes(text) ?? false, label);
    if (reached) return;
  }
  throw new Error(`Native Tab never reached ${label}`);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1366, height: 844 },
  { width: 390, height: 600 }, { width: 390, height: 844 }]) {
  for (const denarii of [0, 40]) {
    test(`Chapel enlarged native focus and cost ${denarii}d/${viewport.width}x${viewport.height}`, async ({ page }, info) => {
      const base = createInitialState(104);
      const state = { ...base, denarii, phase: 'management' as const, turn: 8, year: 2, season: 'winter' as const,
        activeTab: 'chapel', tutorialsSeen: ['chapel'], chapel: { ...base.chapel,
          dilemmasCompleted: MORAL_DILEMMAS.filter(d => d.id !== 'caedmons_proposal').map(d => d.id) } };
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.addInitScript(raw => {
        if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
      }, writeV2Save(state));
      await page.goto('/');
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
      await tabTo(page, 'Moral Dilemma');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: "Brother Caedmon's Proposal" })).toBeVisible();
      const label = denarii ? 'Fund the school' : "Allow it but don't fund it";
      await tabTo(page, label);
      const choice = page.getByRole('button', { name: new RegExp(label) });
      await expect(choice).toBeFocused();
      const reason = page.getByText(denarii ? 'Cost: 40d' : 'Requires 40d · Treasury: 0d', { exact: true });
      const geometry = await choice.evaluate((button, reasonText) => {
        const header = document.querySelector('.game-header');
        const footer = document.querySelector('.sticky.bottom-0');
        const headerBottom = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
        const footerTop = footer?.getBoundingClientRect().top ?? innerHeight;
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const reasonNode = [...document.querySelectorAll('span')].find(node => node.textContent === reasonText);
        const reasonBox = reasonNode?.getBoundingClientRect();
        return { headerBottom, footerTop, top: box.top, bottom: box.bottom,
          unobstructed: !!hit && button.contains(hit), reasonTop: reasonBox?.top, reasonBottom: reasonBox?.bottom };
      }, denarii ? 'Cost: 40d' : 'Requires 40d · Treasury: 0d');
      await page.screenshot({ path: info.outputPath('native-focus.png'), animations: 'disabled' });
      await info.attach('focus-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.footerTop);
      expect(geometry.unobstructed).toBe(true);
      await expect(reason).toBeVisible();
      expect(geometry.reasonTop).toBeGreaterThanOrEqual(geometry.headerBottom);
      expect(geometry.reasonBottom).toBeLessThanOrEqual(geometry.footerTop);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Return to Chapel' })).toBeVisible();
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
      if (!raw) throw new Error('Missing focused-choice save');
      const saved = readV2Save(raw);
      if (!saved.ok) throw new Error(saved.error);
      expect(saved.state).toMatchObject({ denarii: 0, chapel: { faith: denarii ? 65 : 55,
        piety: denarii ? 42 : 35, happiness: denarii ? 80 : 65 } });
      expect(errors).toEqual([]);
    });
  }
}
