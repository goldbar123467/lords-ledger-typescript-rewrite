import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readLegacySave, writeV2Save } from '../../../src/save/saveGame.ts';
import { failureNarratives, victoryTitles } from '../../../src/data/endings.ts';
import { SYNERGY_PATH_LIST } from '../../../src/data/synergies.ts';

const imported = readLegacySave(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
if (!imported.ok) throw new Error(imported.error);
const base = imported.state;
for (const path of SYNERGY_PATH_LIST) test(`${path.name} keeps strategy words intact on enlarged short phones`, async ({ page }, testInfo) => {
  const state = { ...base, phase: 'victory' as const, turn: 40, year: 10, season: 'winter' as const,
    synergies: { ...base.synergies, activated: path.tiers.map(tier => tier.id) } };
  await page.setViewportSize({ width: 390, height: 600 });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await page.addStyleTag({ content: 'html { font-size:200% !important; }' });
  const panel = page.getByRole('heading', { name: 'Strategy Paths' }).locator('..');
  const name = panel.getByText(path.name, { exact: true });
  await expect(name).toHaveCSS('font-size', '28px');
  await page.evaluate(() => document.fonts.ready);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: testInfo.outputPath('strategy.png') });
  const words = await name.evaluate(element => {
    const text = element.firstChild;
    if (!text) throw new Error('Missing strategy name text');
    return Array.from((text.textContent ?? '').matchAll(/\S+/g), match => {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      return { word: match[0], lines: range.getClientRects().length };
    });
  });
  for (const word of words) expect(word.lines, `Readable whole word: ${word.word}`).toBe(1);
  const box = await panel.boundingBox();
  if (!box) throw new Error('Missing strategy panel');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(panel).toContainText(`Tier 3: ${path.tiers[2]?.title}`);
});
function luminance(color: string) {
  const values = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = values;
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Invalid color: ${color}`);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const scenarios = [
  { name: 'balanced victory', heading: victoryTitles.balanced.title, failure: false, changes: {} },
  { name: 'fragile victory', heading: victoryTitles.builder.title, failure: false,
    changes: { denarii: 20, food: 0, population: 3, garrison: 0 } },
  ...(['depopulation', 'bankruptcy', 'famine'] as const).map(type => ({ name: type,
    heading: failureNarratives[type].title, failure: true, changes: { gameOverReason: { type, reason: 'Outcome presentation fixture' } } })),
];
for (const scenario of scenarios) test(`${scenario.name} retains resources and restarts from enlarged phone layout`, async ({ page }) => {
  const state = { ...base, ...scenario.changes, turn: 40, season: 'winter' as const, year: 10,
    phase: scenario.failure ? 'game_over' as const : 'victory' as const,
    ...(scenario.name === 'fragile victory' ? { inventory: Object.fromEntries(Object.keys(base.inventory).map(key => [key, 0])) } : {}) };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible();
  if (scenario.name === 'fragile victory') await expect(page.getByText('You survived by the skin of your teeth.')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size:200% !important; }' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
  const resources = page.getByRole('definition');
  await expect(resources).toHaveCount(4);
  const terms = page.getByRole('term');
  await expect(terms).toHaveText(['Denarii', 'Food', 'Families', 'Garrison']);
  for (const term of await terms.all()) {
    await expect.poll(() => term.evaluate(element => getComputedStyle(element).fontSize)).toBe('28px');
    expect(await term.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await expect(resources).toHaveText([`${state.denarii}d`, String(state.food), String(state.population), String(state.garrison)]);
  for (const color of await page.locator('.terminal-card h2, .terminal-resources dt, .terminal-resources dd').evaluateAll(elements => elements.map(element => getComputedStyle(element).color))) {
    const light = luminance(color), dark = luminance('rgb(35, 30, 22)');
    expect((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
  const action = page.getByRole('button', { name: scenario.failure ? 'Try Again' : 'Reign Again', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect.poll(() => action.evaluate(element => getComputedStyle(element).fontSize)).toBe('32px');
  const box = await action.boundingBox();
  if (!box) throw new Error('Missing restart action');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await action.click();
  await expect(action).toHaveCount(0);
  await expect(page.locator('body')).toContainText('Turn 1/40');
});
