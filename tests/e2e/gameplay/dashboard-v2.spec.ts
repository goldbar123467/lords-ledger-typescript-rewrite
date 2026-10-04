import { expect, test, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';
import { TAB_CONFIG } from '../../../src/data/tabs.ts';

const started = gameReducer(createInitialState(17), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
const normal = { ...started, tutorialsSeen: TAB_CONFIG.map(tab => tab.id) };

function luminance(rgb: string) {
  const channels = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Invalid color: ${rgb}`);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function expectReadableText(page: Page, selector: string, background: string) {
  for (const color of await page.locator(selector).evaluateAll(elements => elements.map(element => getComputedStyle(element).color))) {
    const light = luminance(color), dark = luminance(background);
    expect((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
}

async function load(page: Page, state: typeof normal, enlarged = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  if (enlarged) {
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.locator('html')).toHaveCSS('font-size', '32px');
  }
  await page.evaluate(() => document.fonts.ready);
}

async function expectFittingMetrics(page: Page, enlarged: boolean) {
  const cells = page.locator('.resource-stat');
  await expect(cells).toHaveCount(7);
  const metrics = await cells.evaluateAll(elements => elements.map(cell => {
    const bounds = cell.getBoundingClientRect();
    const label = cell.querySelector('.resource-stat-heading');
    if (!label) throw new Error('Resource label missing');
    const box = label.getBoundingClientRect();
    return { text: label.textContent, fontSize: parseFloat(getComputedStyle(label).fontSize),
      overflow: Math.max(bounds.left - box.left, box.right - bounds.right, cell.scrollWidth - cell.clientWidth) };
  }));
  for (const metric of metrics) {
    expect.soft(metric.fontSize, `${metric.text} readable size`).toBeGreaterThanOrEqual(enlarged ? 28 : 14);
    expect.soft(metric.overflow, `${metric.text} fits its cell`).toBeLessThanOrEqual(0.5);
  }
  expect(await page.locator('.dashboard').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

for (const [width, height, enlarged] of [
  [320, 844, false], [390, 844, false], [640, 844, false],
  [1280, 720, false], [1366, 768, false], [1920, 1080, false],
  [390, 844, true], [1366, 768, true],
] as const) {
  test(`dashboard labels fit at ${width}px${enlarged ? ' with enlarged text' : ''}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await load(page, normal, enlarged);
    await expectFittingMetrics(page, enlarged);
    await expectReadableText(page, '.resource-stat-heading, .resource-stat-value, .resource-morale-label', 'rgb(26, 22, 16)');
    await expect(page.getByRole('progressbar', { name: 'Reign progress' })).toHaveAttribute('aria-valuenow', '1');
    expect(await page.getByRole('button', { name: 'Simulate this season' }).evaluate(button => {
      const box = button.getBoundingClientRect();
      return [box.top + 5, (box.top + box.bottom) / 2, box.bottom - 5].every(y =>
        button.contains(document.elementFromPoint((box.left + box.right) / 2, y)));
    }), 'Header must not cover the season action').toBe(true);
    for (const [resource, value] of Object.entries({ denarii: `${normal.denarii}d`, food: normal.food,
      families: normal.population, garrison: normal.garrison, morale: normal.military.morale,
      faith: normal.chapel.faith, piety: normal.chapel.piety })) {
      await expect(page.getByTestId(`resource-${resource}`)).toHaveText(String(value));
    }
    await page.screenshot({ path: info.outputPath('dashboard.png') });
    await page.getByRole('button', { name: /^Market tab/ }).click();
    await expect(page.getByRole('button', { name: /^Market tab/ })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Simulate this season' }).click();
    await expect(page.getByRole('group', { name: 'Choose your response' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1366]) {
  test(`dashboard preserves critical warnings and saved values at ${width}px`, async ({ page }, info) => {
    const warnings = { ...normal, denarii: 0, food: 0, population: 5, garrison: 0, bankruptcyTurns: 5,
      inventory: Object.fromEntries(Object.keys(normal.inventory).map(key => [key, 0])),
      military: { ...normal.military, morale: 10, garrison: { levy: 0, menAtArms: 0, knights: 0 } },
      resourceDeltas: { denarii: -15, food: -20, population: -2, garrison: -1 },
    };
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await load(page, warnings);
    await expectFittingMetrics(page, false);
    const dashboard = page.locator('.dashboard');
    await expect(dashboard.getByText('Treasury is empty! 1 more season and creditors seize your estate. Sell goods or cut spending.', { exact: true })).toBeVisible();
    await expect(dashboard.getByText('No garrison! Your fortifications must carry the defense; a breach brings extra losses.', { exact: true })).toBeVisible();
    await expect(dashboard.getByText('Population is critically low! Build farms to grow food and attract settlers.', { exact: true })).toBeVisible();
    await expect(dashboard.getByText('No food! Your people will starve and leave. Buy grain or build farms immediately.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('resource-morale')).toHaveAccessibleName('Morale 10, Mutinous');
    await expectReadableText(page, '.dashboard-warnings li', 'rgb(42, 23, 19)');
    await expectReadableText(page, '.resource-stat-delta, .resource-morale-label', 'rgb(26, 22, 16)');
    for (const delta of ['-15', '-20', '-2', '-1']) await expect(dashboard.getByText(delta, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('critical-resources.png') });
    await page.getByRole('button', { name: 'Save game' }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByTestId('resource-denarii')).toHaveText('0d');
    await expect(page.getByTestId('resource-morale')).toHaveText('10');
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);
  });
}

test('perspective meters stay separate with enlarged phone text', async ({ page }, info) => {
  const simulated = gameReducer({ ...normal, turn: 7, season: 'autumn', year: 2, taxRate: 'high' },
    { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
  const entered = gameReducer(simulated, { type: 'ADVANCE_TURN' });
  expect(entered.currentFlipId).toBe('serf_week');
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, entered, true);
  const meters = page.locator('.dashboard').getByRole('meter');
  await expect(meters).toHaveCount(3);
  await expectReadableText(page, '.flip-stat', 'rgb(26, 22, 16)');
  for (const meter of await meters.all()) {
    expect(await meter.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect(meters.nth(0)).toHaveAttribute('aria-valuenow', '60');
  await expect(meters.nth(1)).toHaveAttribute('aria-valuenow', '70');
  await expect(meters.nth(2)).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('.resource-grid')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('perspective-meters.png') });
  await page.getByRole('button', { name: 'Begin', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Option 1:/ })).toBeVisible();
});
