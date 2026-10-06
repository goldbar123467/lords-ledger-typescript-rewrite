import { expect, test, type Page, type Locator } from '@playwright/test';
import disputes from '../../../src/data/disputes.ts';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
const dispute = disputes[0];
if (!dispute || !dispute.petitionerA || !dispute.petitionerB) throw new Error('Missing paired fixture');
async function setup(page: Page, width: number) {
  const state = { ...createInitialState(104), phase: 'management', activeTab: 'hall', tutorialsSeen: ['hall'] }, raw = writeV2Save(state);
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
  await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(dispute.title) }).click();
  return { state, raw };
}
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
for (const width of [390, 1366]) {
  test('pointer speech skip remains complete after timer ticks at ' + width, async ({ page }, info) => {
    await setup(page, width);
    await page.getByRole('button', { name: 'Hear the Case', exact: true }).click();
    await page.locator('.dispute-cursor').first().locator('..').click();
    await page.screenshot({ path: info.outputPath('skipped-speech.png'), fullPage: true, animations: 'disabled' });
    await page.waitForTimeout(500);
    await expect(page.getByText(dispute.petitionerA.speech, { exact: true }).and(page.locator(':not(.sr-only)'))).toHaveCount(1);
    await page.locator('.dispute-cursor').first().locator('..').click();
    await page.waitForTimeout(500);
    await expect(page.getByText(dispute.petitionerB.speech, { exact: true }).and(page.locator(':not(.sr-only)'))).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Make Your Ruling', exact: true })).toBeVisible();
  });
  test('native keyboard reveals both speeches, previews effects and saves ruling at ' + width, async ({ page }, info) => {
    const { state } = await setup(page, width), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const hear = page.getByRole('button', { name: 'Hear the Case', exact: true });
    await tabTo(page, hear); await page.keyboard.press('Enter');
    const a = page.getByRole('button', { name: 'Reveal full speech from ' + dispute.petitionerA.name, exact: true });
    await tabTo(page, a); await page.keyboard.press('Enter'); await expect(a).toBeFocused();
    await expect(a).toHaveAttribute('aria-disabled', 'true');
    const b = page.getByRole('button', { name: 'Reveal full speech from ' + dispute.petitionerB.name, exact: true });
    await tabTo(page, b); await page.keyboard.press('Space'); await expect(b).toBeFocused();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-dispute-speech]').first()).toHaveText(dispute.petitionerA.speech);
    await expect(page.locator('[data-dispute-speech]').last()).toHaveText(dispute.petitionerB.speech);
    const make = page.getByRole('button', { name: 'Make Your Ruling', exact: true });
    await expect(make).toBeVisible(); await tabTo(page, make); await page.keyboard.press('Enter');
    const ruling = dispute.rulings[0], choice = page.getByRole('button', { name: new RegExp(ruling.label) });
    await tabTo(page, choice);
    for (const [meter, delta] of Object.entries(ruling.consequences)) if (delta !== 0) {
      await expect(choice).toContainText(meter.charAt(0).toUpperCase() + meter.slice(1) + ' ' + (delta > 0 ? '+' : '') + delta);
    }
    await page.screenshot({ path: info.outputPath('keyboard-ruling.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Enter'); await expect(page.getByText(ruling.aftermath, { exact: true })).toBeVisible();
    const save = page.getByRole('button', { name: 'Save game', exact: true }); await tabTo(page, save); await page.keyboard.press('Enter');
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save')); if (!raw) throw new Error('Missing save');
    const loaded = readV2Save(raw); if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.greatHall).toEqual(gameReducer(state, { type: 'HALL_RULE_DISPUTE', payload: { disputeId: dispute.id, rulingId: ruling.id } }).greatHall);
    expect(loaded.state.rngState).toBe(state.rngState); expect(errors).toEqual([]);
  });
  for (const view of ['pending', 'aftermath']) test('Load resets mounted ' + view + ' dispute at ' + width, async ({ page }) => {
    const { raw } = await setup(page, width);
    await page.getByRole('button', { name: 'Hear the Case', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal full speech from ' + dispute.petitionerA.name, exact: true }).click();
    await page.getByRole('button', { name: 'Reveal full speech from ' + dispute.petitionerB.name, exact: true }).click();
    if (view === 'aftermath') {
      await page.getByRole('button', { name: 'Make Your Ruling', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(dispute.rulings[0].label) }).click();
    }
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'Make Your Ruling', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(dispute.title) }).click();
    await expect(page.getByRole('button', { name: 'Hear the Case', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  });
  test('reduced motion shows complete testimony and permits ruling at ' + width, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await setup(page, width);
    await page.getByRole('button', { name: 'Hear the Case', exact: true }).click();
    await expect(page.locator('[data-dispute-speech]').first()).toHaveText(dispute.petitionerA.speech);
    await expect(page.locator('[data-dispute-speech]').last()).toHaveText(dispute.petitionerB.speech);
    await expect(page.locator('.dispute-cursor')).toHaveCount(0);
    await page.getByRole('button', { name: 'Make Your Ruling', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(dispute.rulings[0].label) }).click();
    await expect(page.getByText(dispute.rulings[0].aftermath, { exact: true })).toBeVisible();
  });
}
