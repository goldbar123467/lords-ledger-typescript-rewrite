import {test, expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) for (const textScale of [1, 2]) {
  test(`Forge grade words remain readable at ${width} with text scale ${textScale}`, async ({page}, info) => {
    let state: ReturnType<typeof gameReducer> = {...createInitialState(104), phase: 'management', activeTab: 'forge', tutorialsSeen: ['forge']};
    for (const [index, qualityScore] of [0, 30, 50, 70, 90].entries()) {
      state = gameReducer(state, {type: 'BLACKSMITH_FORGE_COMPLETE', payload: {itemId: 'dagger', qualityScore, completionUid: index + 1}});
    }
    expect(state.blacksmith.inventory).toHaveLength(5);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: 844});
    await page.addInitScript(raw => {localStorage.setItem('lords-ledger-v2-save', raw);}, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    await page.locator('button').filter({has: page.locator('span').filter({hasText: /^Ledger$/})}).click();
    await page.evaluate(scale => {document.documentElement.style.fontSize = `${16 * scale}px`;}, textScale);
    await page.evaluate(() => document.fonts.ready);
    const chart = page.getByText('Quality Distribution', {exact: true}).locator('..');
    await chart.scrollIntoViewIfNeeded();
    await chart.screenshot({path: info.outputPath('grade-chart.png'), animations: 'disabled'});
    const measurements = [];
    for (const grade of ['Masterwork', 'Fine', 'Standard', 'Rough', 'Scrap']) {
      const label = chart.getByText(grade, {exact: true});
      const metric = await label.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const lines = [...range.getClientRects()];
        const bounds = element.getBoundingClientRect();
        return {lines: lines.length, textWidth: Math.max(...lines.map(line => line.width)), width: bounds.width,
          right: bounds.right, viewport: innerWidth, count: element.parentElement?.textContent};
      });
      measurements.push({grade, ...metric});
    }
    writeFileSync(info.outputPath('measurements.json'), JSON.stringify(measurements, null, 2));
    for (const metric of measurements) {
      expect(metric.lines, metric.grade).toBe(1);
      expect(metric.textWidth, metric.grade).toBeLessThanOrEqual(metric.width + 1);
      expect(metric.right, metric.grade).toBeLessThanOrEqual(metric.viewport);
      expect(metric.count).toContain('1');
    }
    expect(errors).toEqual([]);
  });
}
