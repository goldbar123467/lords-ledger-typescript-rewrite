import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

for (const fontSize of [16, 32]) {
for (const width of [390, 1366]) {
  for (const scenario of ['weak', 'fortified', 'bonuses'] as const) {
    test(`Watchtower readiness ${scenario} at ${width}px ${fontSize === 32 ? 'enlarged' : 'normal'} matches actual military rules`, async ({ page }, testInfo) => {
      const base = createInitialState(104);
      const state = { ...base, phase: 'management', turn: 8, season: 'winter', year: 2,
        activeTab: 'military', tutorialsSeen: ['military', 'map'],
        blacksmith: { ...base.blacksmith, equipped: scenario === 'bonuses' ? [{ id: 'readiness-fixture',
          itemId: 'longsword', name: 'Longsword', category: 'weapon', quality: 'Masterwork',
          qualityScore: 90, militaryBonus: 8, tradeValue: 15 }] : base.blacksmith.equipped },
        watchtower: { ...base.watchtower, rodericScribesNoteSeen: true, scannedThisSeason: true },
      };
      if (scenario === 'fortified') {
        state.garrison = 0;
        state.castleLevel = 4;
        state.military = { ...base.military, walls: 4, gate: 4, moat: 3,
          garrison: { levy: 0, menAtArms: 0, knights: 0 } };
      }
      if (scenario === 'bonuses') {
        state.tavern = { ...base.tavern, aldricDrillActive: 1 };
        state.watchtower = { ...state.watchtower, warnings: { criminalRaidBonus: 2,
          scottishRaidBonus: 3, raidRequirementReduction: 2, merchantPreview: null } };
      }
      await page.setViewportSize({ width, height: fontSize === 32 ? 600 : 844 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(raw => {
        if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
        Math.random = () => 0.99; // Presentation-only recommendation selection; simulation carries saved RNG.
      }, writeV2Save(state));
      await page.goto('/');
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.addStyleTag({ content: 'html { font-size: ' + fontSize + 'px !important; }' });
      await page.evaluate(() => document.fonts.ready);
      const rating = scenario === 'weak' ? 15 : scenario === 'fortified' ? 78 : 24;
      const military = page.getByRole('heading', { name: /Raid Defense Status/ }).locator('..');
      await expect(military).toContainText(`Defense Rating: ${rating}`);
      await expect(military).toContainText(`Outlaws: ${scenario === 'bonuses' ? 28 : rating}/18 defense`);
      await expect(military).toContainText(`Scots: ${scenario === 'bonuses' ? 29 : rating}/38 defense`);
      await expectTextWithinCard(military);
      await military.screenshot({ path: testInfo.outputPath('military-readiness.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Climb the Watchtower', exact: true }).click();
      const status = page.getByRole('heading', { name: 'Defense Status', exact: true }).locator('..');
      await expect(status).toContainText(`Defense rating: ${rating}`);
      await expect(status).toContainText('Morale: Adequate (50/100)');
      await expect(status).toContainText(scenario === 'fortified' ? 'Concentric Walls' : 'Wooden Palisade');
      await expect(status).toContainText(`Outlaws: ${scenario === 'bonuses' ? 28 : rating}/18`);
      await expect(status).toContainText(`Scots: ${scenario === 'bonuses' ? 29 : rating}/38`);
      await expectTextWithinCard(status);
      await status.screenshot({ path: testInfo.outputPath('readiness.png'), animations: 'disabled' });
      if (scenario === 'weak') {
        await page.getByRole('button', { name: /Captain.*Briefing/ }).click();
        const advice = page.getByText(/My recommendation: strengthen our defenses immediately/);
        await expect(advice).toContainText('rating is 15');
        await expect(advice).toContainText('need 18');
        await advice.locator('..').screenshot({ path: testInfo.outputPath('captain-advice.png'), animations: 'disabled' });
        await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.getByRole('button', { name: /Map tab/ }).click();
      await page.locator('button[title="Climb the Watchtower"]').click();
      await expect(page.getByRole('heading', { name: 'Defense Status', exact: true }).locator('..')).toContainText(`Defense rating: ${rating}`);
      expect(errors).toEqual([]);
    });
  }
}
}

// Document scroll width can pass while text is clipped by an ancestor card.
async function expectTextWithinCard(card: import('@playwright/test').Locator) {
  const overflow = await card.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const failures: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) {
          failures.push(node.textContent.trim());
        }
      }
    }
    return failures;
  });
  expect(overflow, 'Every rendered text fragment must fit inside its card').toEqual([]);
}