import type {GameSnapshot} from '../../../src/save/saveGame.ts';
import { expect, test, type Page, type Locator } from '@playwright/test';
import disputes from '../../../src/data/disputes.ts';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 120; i++) { if (await target.evaluate(e => e === document.activeElement)) return; await page.keyboard.press('Tab'); }
  await expect(target).toBeFocused();
}
for (const scenario of [{ width: 1366, height: 768, root: 16, solo: false },
  { width: 390, height: 600, root: 32, solo: false }, { width: 390, height: 600, root: 32, solo: true }]) {
  test('focused ruling label and effects stay readable ' + JSON.stringify(scenario), async ({ page }, info) => {
    const dispute = scenario.solo ? disputes.find(d => d.id === 'dispute_015') : disputes[0]; if (!dispute) throw new Error('Missing case');
    let state: GameSnapshot = { ...createInitialState(104), phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    if (scenario.solo) { state = { ...state, turn: 4, season: 'winter' as const }; for (const prior of disputes) {
      if (prior.id === dispute.id) break;
      if (prior.season === 'any' || prior.season === 'winter') state = gameReducer(state, { type: 'HALL_RULE_DISPUTE', payload: { disputeId: prior.id, rulingId: prior.rulings[0].id } });
    } }
    const raw = writeV2Save(state), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/'); await page.evaluate(root => document.documentElement.style.fontSize = root + 'px', scenario.root);
    await tabTo(page, page.getByRole('button', { name: 'Load saved game', exact: true })); await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: new RegExp(dispute.title) })); await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: 'Hear the Case', exact: true })); await page.keyboard.press('Enter');
    if (dispute.petitionerA && dispute.petitionerB) {
      for (const person of [dispute.petitionerA, dispute.petitionerB]) {
        const reveal = page.getByRole('button', { name: 'Reveal full speech from ' + person.name, exact: true });
        await tabTo(page, reveal); await page.keyboard.press('Enter');
      }
      const make = page.getByRole('button', { name: 'Make Your Ruling', exact: true }); await expect(make).toBeVisible();
      await tabTo(page, make); await page.keyboard.press('Enter');
    }
    const first = dispute.rulings[0];
    for (const ruling of dispute.rulings) {
      const choice = page.getByRole('button', { name: new RegExp(ruling.label) }); await tabTo(page, choice); await page.waitForTimeout(450);
      const geometry = await choice.evaluate(e => {
        const r = e.getBoundingClientRect(); const hit = (y: number) => { const target = document.elementFromPoint(r.x + r.width / 2, y); return !!target && (target === e || e.contains(target)); };
        return { inside: r.top >= 3 && r.bottom <= innerHeight - 3 && r.left >= 0 && r.right <= innerWidth,
          top: hit(r.top + 3), center: hit(r.top + r.height / 2), bottom: hit(r.bottom - 3), outline: getComputedStyle(e).outlineStyle };
      });
      expect(geometry).toEqual({ inside: true, top: true, center: true, bottom: true, outline: 'solid' });
      for (const [meter, delta] of Object.entries(ruling.consequences)) if (delta !== 0) await expect(choice).toContainText(meter[0]?.toUpperCase() + meter.slice(1) + ' ' + (delta > 0 ? '+' : '') + delta);
      const descriptionId = await choice.getAttribute('aria-describedby'); expect(descriptionId).not.toBeNull();
      await expect(page.locator('[id="' + descriptionId + '"]')).toHaveText(ruling.decree);
      await page.screenshot({ path: info.outputPath('focused-' + ruling.id + '.png'), animations: 'disabled' });
    }
    const chosen = page.getByRole('button', { name: new RegExp(first.label) }); await tabTo(page, chosen); await page.keyboard.press('Enter');
    await expect(page.getByText(first.aftermath, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save')); if (!saved) throw new Error('Missing save');
    const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.greatHall).toEqual(gameReducer(state, { type: 'HALL_RULE_DISPUTE', payload: { disputeId: dispute.id, rulingId: first.id } }).greatHall);
    expect(loaded.state.rngState).toBe(state.rngState); expect(errors).toEqual([]);
  });
}
