import { expect, test, type Page } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.js';
import { MANUSCRIPT_SYMBOLS } from '../../../src/data/chapel.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

declare global {
  interface Window { recordManuscriptFlash: (symbol: string) => Promise<void> }
}

async function observeVisibleFlashes(page: Page) {
  await page.evaluate(symbols => {
    let previous: string | null = null;
    const observer = new MutationObserver(() => {
      const button = [...document.querySelectorAll('button')].find(candidate =>
        symbols.includes(candidate.textContent?.trim() ?? '') && candidate.style.border.startsWith('2px'));
      const active = button?.textContent?.trim() ?? null;
      if (active && active !== previous) void window.recordManuscriptFlash(active);
      previous = active;
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  }, [...MANUSCRIPT_SYMBOLS]);
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Missing manuscript save');
  const saved = readV2Save(raw);
  if (!saved.ok) throw new Error(saved.error);
  return { raw, state: saved.state };
}

for (const width of [390, 1366]) {
  test(`real manuscript flashes, partial save and retry at ${width}px`, async ({ page }, info) => {
    // Four real authored sequences take 16.1s, followed by reload and a real failed retry.
    test.setTimeout(60_000);
    const quill = width === 1366;
    const base = createInitialState(104);
    const state = { ...base, phase: 'management', turn: 8, year: 2, season: 'winter', activeTab: 'chapel',
      tutorialsSeen: ['chapel'], chapel: { ...base.chapel, inventory: quill ? ['quill_ink'] : [] } };
    const errors: string[] = [];
    const flashes: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('recordManuscriptFlash', (symbol: string) => { flashes.push(symbol); });
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await observeVisibleFlashes(page);
    await page.getByRole('button', { name: /Enter the Scriptorium/ }).click();
    let seen = 0;
    for (let round = 1; round <= 4; round++) {
      const length = round + 2;
      await test.step(`round ${round}: wait for all ${length} real flashes`, async () => {
        await expect(page.getByText('Now repeat the sequence!', { exact: true }))
          .toBeVisible({ timeout: length * 850 + 2200 });
      });
      expect(flashes.length).toBe(seen + length);
      const pattern = flashes.slice(seen);
      seen += length;
      if (round === 1) await page.screenshot({ path: info.outputPath('manuscript-input.png'), animations: 'disabled' });
      for (let position = 0; position < pattern.length; position++) {
        const symbol = pattern[position];
        if (!symbol) throw new Error('Missing visibly flashed symbol');
        await page.getByRole('button', { name: symbol, exact: true }).click();
        if (round === 2 && position === 0) {
          const partial = await save(page);
          expect(partial.state).toMatchObject({ chapel: { msPhase: 'input', msRound: 2,
            msPlayerInput: [MANUSCRIPT_SYMBOLS.indexOf(symbol)] } });
          await page.reload();
          await page.getByRole('button', { name: 'Load saved game' }).click();
          await observeVisibleFlashes(page);
          expect((await save(page)).raw).toBe(partial.raw);
          await expect(page.getByText('Now repeat the sequence!', { exact: true })).toBeVisible();
        }
      }
    }
    await expect(page.getByText('Manuscript Copied Successfully!', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('manuscript-success.png'), animations: 'disabled' });
    const completed = await save(page);
    const reward = quill ? 20 : 15;
    expect(completed.state).toMatchObject({ denarii: 500 + reward, chapel: { msPhase: 'success',
      msReward: reward, faith: 55, piety: 33, msPlayerInput: expect.any(Array) } });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    expect((await save(page)).raw).toBe(completed.raw);
    await observeVisibleFlashes(page);
    await page.getByRole('button', { name: 'Try Again', exact: true }).click();
    await expect(page.getByText('Now repeat the sequence!', { exact: true })).toBeVisible();
    expect(flashes.length).toBe(21);
    const wrong = MANUSCRIPT_SYMBOLS.find(symbol => symbol !== flashes[18]);
    if (!wrong) throw new Error('No wrong visible symbol available');
    await page.getByRole('button', { name: wrong, exact: true }).click();
    await expect(page.getByText('The ink smudges...', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('manuscript-failure.png'), animations: 'disabled' });
    expect((await save(page)).state).toMatchObject({ denarii: 500 + reward,
      chapel: { msPhase: 'fail', msReward: 0, faith: 55, piety: 33 } });
    expect(errors).toEqual([]);
  });
}
