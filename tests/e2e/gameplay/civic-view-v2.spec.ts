import type {GameSnapshot} from '../../../src/save/saveGame.ts';
import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { COUNCIL_TOPICS, DECREE_OPTIONS } from '../../../src/data/decrees.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) {
  test('Council displays numeric effects before selecting at ' + width, async ({ page }, info) => {
    const state = { ...createInitialState(104), turn: 4, season: 'winter' as const, phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Council', exact: true }).click();
    await page.screenshot({ path: info.outputPath('council-debate.png'), fullPage: true });
    for (const option of COUNCIL_TOPICS[0].options) {
      const choice = page.getByRole('button', { name: new RegExp(option.label) });
      for (const [key, value] of Object.entries(option.consequences)) if (value) {
        await expect(choice).toContainText(key[0]?.toUpperCase() + key.slice(1) + ' ' + (value > 0 ? '+' : '') + value);
      }
    }
  });
  test('exhausted decree quota permits reading but prevents sealing at ' + width, async ({ page }, info) => {
    let state: GameSnapshot = { ...createInitialState(104), phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    for (const decree of DECREE_OPTIONS.slice(0, 2)) {
      state = gameReducer(state, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } });
      state = gameReducer(state, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: decree.id } });
    }
    const raw = writeV2Save(state);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Decrees', exact: true }).click();
    await page.screenshot({ path: info.outputPath('quota-list.png'), fullPage: true });
    const inspect = page.getByRole('button', { name: new RegExp(DECREE_OPTIONS[0].name) });
    await expect(inspect).toBeEnabled(); await inspect.click();
    await expect(page.getByText(DECREE_OPTIONS[0].description, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seal This Decree', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  });
}

for (const scenario of [{ width: 1366, height: 768, root: 16 }, { width: 390, height: 600, root: 32 }]) {
  test('all Council choices preserve content and native keyboard geometry ' + scenario.width, async ({ page }, info) => {
    const state = { ...createInitialState(104), turn: 4, season: 'winter' as const, phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    await page.setViewportSize(scenario); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, writeV2Save(state));
    await page.goto('/'); await page.evaluate(root => document.documentElement.style.fontSize = root + 'px', scenario.root);
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    for (const topic of COUNCIL_TOPICS) {
      await page.getByRole('button', { name: 'Council', exact: true }).click();
      await expect(page.getByText(topic.description, { exact: true })).toBeVisible();
      for (const advisor of Object.values(topic.advisors)) await expect(page.getByText(advisor.speech, { exact: true })).toBeVisible();
      for (const option of topic.options) {
        const choice = page.getByRole('button', { name: new RegExp(option.label) });
        for (let i = 0; i < 100 && !(await choice.evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('Tab');
        await expect(choice).toBeFocused(); await page.waitForTimeout(100);
        const geometry = await choice.evaluate(e => {
          const r = e.getBoundingClientRect(); const hit = (y: number) => { const target = document.elementFromPoint(r.x + r.width / 2, y); return !!target && (target === e || e.contains(target)); };
          return { inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
            top: hit(r.top + 3), center: hit(r.top + r.height / 2), bottom: hit(r.bottom - 3), outline: getComputedStyle(e).outlineStyle };
        });
        expect(geometry).toEqual({ inside: true, top: true, center: true, bottom: true, outline: 'solid' });
        for (const [key, value] of Object.entries(option.consequences)) if (value) await expect(choice).toContainText(key[0]?.toUpperCase() + key.slice(1) + ' ' + (value > 0 ? '+' : '') + value);
      }
      await page.screenshot({ path: info.outputPath(topic.id + '-keyboard.png'), animations: 'disabled' });
      await page.getByRole('button', { name: new RegExp(topic.options[0].label) }).click();
      await expect(page.getByText(topic.options[0].aftermath, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show Historical Context', exact: true }).click();
      await expect(page.getByText(topic.historicalNote, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Return to Throne', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Council', exact: true }).click();
    await expect(page.getByText(/All available matters have been settled/)).toBeVisible();
  });
  test('all decrees remain fully readable without changing the exhausted save ' + scenario.width, async ({ page }, info) => {
    let state: GameSnapshot = { ...createInitialState(104), phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    for (const decree of DECREE_OPTIONS.slice(0, 2)) {
      state = gameReducer(state, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: decree.id } });
      state = gameReducer(state, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: decree.id } });
    }
    const raw = writeV2Save(state); await page.setViewportSize(scenario);
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
    await page.goto('/'); await page.evaluate(root => document.documentElement.style.fontSize = root + 'px', scenario.root);
    await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Decrees', exact: true }).click();
    for (const decree of DECREE_OPTIONS) {
      const inspect = page.getByRole('button', { name: 'View decree: ' + decree.name, exact: true });
      await inspect.evaluate(e => e.scrollIntoView({ block: 'center' })); const box = await inspect.boundingBox(); if (!box) throw new Error('Missing inspect geometry');
      expect(await inspect.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === e || !!hit && e.contains(hit); })).toBe(true);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); const before = await page.evaluate(() => scrollY); await page.waitForTimeout(150);
      expect(await page.evaluate(() => scrollY)).toBe(before); await page.mouse.up();
      await expect(page.getByText(decree.description, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Seal This Decree', exact: true })).toBeDisabled();
      await page.screenshot({ path: info.outputPath(decree.id + '-detail.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  });
}
