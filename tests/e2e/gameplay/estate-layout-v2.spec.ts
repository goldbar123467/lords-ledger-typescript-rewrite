import { expect, test } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [320, 390, 480]) {
  test(`Estate Build New cards stay within a ${width}px phone viewport`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const started = gameReducer(initialState, {
      type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
    });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(started));
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await expect(page.getByText('Build New')).toBeVisible();

    const size = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="build-card-demesne_field"]');
      if (!card) throw new Error('The authored Demesne Field build card is missing');
      const rect = card.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        cardLeft: rect.left,
        cardRight: rect.right,
      };
    });
    expect(size.documentWidth).toBeLessThanOrEqual(width);
    expect(size.cardLeft).toBeGreaterThanOrEqual(0);
    expect(size.cardRight).toBeLessThanOrEqual(width + 0.5);

    await page.evaluate(() => window.scrollTo(1000, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await page.getByTestId('build-card-demesne_field').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`build-new-${width}.png`) });
    expect(errors).toEqual([]);
  });
}
