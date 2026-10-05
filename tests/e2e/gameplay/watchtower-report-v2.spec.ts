import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const [width, height, fontSize] of [[390, 600, 32], [390, 844, 16], [1366, 768, 16], [1366, 768, 32]]) {
  test(`Watchtower report remains readable at ${width}x${height} font ${fontSize}`, async ({ page }, info) => {
    if (width === undefined || height === undefined || fontSize === undefined) throw new Error('Missing report viewport fixture.');
    test.setTimeout(45000);
    const base = createInitialState(104);
    const state = { ...base, phase: 'management', turn: 8, year: 2, season: 'winter', activeTab: 'military',
      tutorialsSeen: ['military', 'map'], watchtower: { ...base.watchtower, scanScribesNoteSeen: true } };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.addStyleTag({ content: `html { font-size: ${fontSize}px !important; }` });
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Climb the Watchtower', exact: true }).click();
    await page.getByRole('button', { name: /Horizon Scan/ }).click();
    await page.getByRole('button', { name: 'Scan the Horizon', exact: true }).click();
    const targets = page.locator('button[data-scan-anomaly]:not(:disabled)');
    await expect(targets.first()).toBeVisible();
    const count = await targets.count();
    for (let i = 0; i < count; i++) await targets.first().click();
    await expect(page.getByRole('heading', { name: "Scout's Report" })).toBeVisible({ timeout: 20000 });
    const findings = page.getByLabel("Scout's findings", { exact: true });
    const metrics = await findings.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
    expect(metrics.height, 'Findings must display several full text lines').toBeGreaterThanOrEqual(fontSize * 4);
    await expect(findings).toHaveAttribute('tabindex', '0');
    await findings.focus();
    await page.keyboard.press('ArrowDown');
    if (metrics.content > metrics.height) await expect.poll(() => findings.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await findings.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await findings.screenshot({ path: info.outputPath('findings-bottom.png'), animations: 'disabled' });
    const ack = page.getByRole('button', { name: 'Acknowledged', exact: true });
    await ack.focus();
    const overflow = await ack.evaluate(element => {
      const card = element.closest('[data-watchtower-report]');
      if (!card) throw new Error('Report card missing.');
      const outer = card.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].some(rect => rect.left < outer.left || rect.right > outer.right);
    });
    expect(overflow, 'Acknowledgement text must fit inside the report').toBe(false);
    const bounds = await ack.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({ path: info.outputPath('acknowledgement.png'), animations: 'disabled' });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Horizon Scan/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!saved) throw new Error('Save missing after acknowledgement.');
    const result = readV2Save(saved);
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toMatchObject({ watchtower: { totalScans: 1, lastScanResult: { anomaliesFound: count } } });
    expect(result.state.denarii).toBe(500 + (count === 5 ? 10 : 5));
    expect(errors).toEqual([]);
  });
}
