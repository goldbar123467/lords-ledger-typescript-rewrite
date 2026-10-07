import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { PERSPECTIVE_FLIPS } from '../../../src/data/perspectiveFlips.ts';
import { CYOA_FLIPS } from '../../../src/data/cyoaFlips.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Story save is missing');
  const result = readV2Save(raw);
  if (!result.ok) throw new Error('Story save failed validation');
  return { raw, state: result.state };
}

for (const width of [390, 1366]) for (const branching of [false, true]) {
  test(`${branching ? 'branching' : 'linear'} story controls and saved continuation at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const started = gameReducer(createInitialState(17), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
    const simulated = gameReducer({ ...started, turn: 7, season: 'autumn' as const, year: 2, taxRate: branching ? 'medium' : 'high' },
      { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const entered = gameReducer(simulated, { type: 'ADVANCE_TURN' });
    const story = branching ? CYOA_FLIPS.cyoa_lord : PERSPECTIVE_FLIPS.serf_week;
    expect(entered.currentFlipId).toBe(story.id);
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(entered));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByRole('heading', { name: story.intro.title, exact: true })).toBeVisible();
    await expect(page.getByText(story.intro.narrativeText, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    const first = page.getByRole('button', { name: /^Option 1:/ });
    await first.focus();
    await page.keyboard.press('Tab');
    const second = page.getByRole('button', { name: /^Option 2:/ });
    await expect(second).toBeFocused();
    await expect(second).toHaveCSS('outline-style', 'solid');
    await expect(second).toHaveCSS('outline-width', '3px');
    const box = await second.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!branching) {
      await expect(second).toHaveAccessibleDescription('60% chance of success');
      await expect(page.getByText('60% chance of success', { exact: true })).toHaveCSS('font-size', '14px');
      const pending = await save(page);
      await second.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(PERSPECTIVE_FLIPS.serf_week.decisions[0].options[1].failureOutcome, { exact: true })).toBeVisible();
      for (const change of ['✧ Hunger -10', '✦ Energy -15', '⌂ Family -15']) {
        await expect(page.getByText(change, { exact: true })).toBeVisible();
      }
      const outcome = await save(page);
      expect(outcome.state.phase).toBe('flip_outcome');
      await page.screenshot({ path: info.outputPath('chance-outcome.png') });
      await page.evaluate(raw => localStorage.setItem('lords-ledger-v2-save', raw), pending.raw);
      await page.getByRole('button', { name: 'Load saved game' }).click();
      await page.getByRole('button', { name: /^Option 2:/ }).click();
      expect((await save(page)).raw).toBe(outcome.raw);
    }
    const returning = page.getByRole('button', { name: 'Return to Your Reign', exact: true });
    for (let step = 0; step < 32 && !await returning.isVisible(); step++) {
      if (await first.isVisible()) await first.click();
      else await page.getByRole('button', { name: /^(Continue|See the Consequences)$/ }).click();
    }
    await expect(returning).toBeVisible();
    await expect(page.getByText(story.returnText, { exact: true })).toBeVisible();
    await expect(page.getByText(story.scribesNote, { exact: false })).toBeVisible();
    if (branching) {
      await expect(page.getByRole('heading', { name: 'The Wise Steward', exact: true })).toBeVisible();
      await expect(page.getByText('Prosperous Ending')).toBeVisible();
      await expect(page.getByText('⚜ Denarii +50', { exact: true })).toBeVisible();
    }
    await expect(page.getByText(branching ? '✧ Food +15' : '✧ Food +12', { exact: true })).toBeVisible();
    const summary = await save(page);
    expect(summary.state.phase).toBe('flip_summary');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(returning).toBeVisible();
    expect((await save(page)).raw).toBe(summary.raw);
    await returning.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('summary-controls.png') });
    await returning.focus();
    await page.keyboard.press('Enter');
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    const after = await save(page);
    expect(after.state.phase).toBe('management');
    expect(after.state.denarii - summary.state.denarii).toBe(branching ? 50 : 0);
    expect(after.state.food - summary.state.food).toBe(branching ? 15 : 12);
    expect(errors).toEqual([]);
  });
}
