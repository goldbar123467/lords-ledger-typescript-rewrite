import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readLegacySave } from '../../../src/save/saveGame.ts';

const imported = readLegacySave(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
if (!imported.ok) throw new Error(imported.error);
const base = imported.state;
const cases = [
  { name: 'fractional roster', state: { ...base, military: { ...base.military, garrison: { ...base.military.garrison, levy: 5.5 } } }, error: 'military.garrison.levy' },
  { name: 'invalid moat level', state: { ...base, military: { ...base.military, moat: 4 } }, error: 'military.moat' },
  { name: 'invalid castle level', state: { ...base, castleLevel: 5 }, error: 'castleLevel' },
];
for (const source of [
  { name: 'v2', key: 'lords-ledger-v2-save', action: 'Load saved game' },
  { name: 'legacy', key: 'lords-ledger-save', action: 'Import old save' },
]) for (const scenario of cases) test(`${source.name} ${scenario.name} is rejected without replacing stored bytes`, async ({ page }, testInfo) => {
  const raw = JSON.stringify(source.name === 'v2' ? { format: 'lords-ledger', version: 2, state: scenario.state } : scenario.state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: source.key, raw });
  await page.goto('/');
  await page.getByRole('button', { name: source.action, exact: true }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(scenario.error);
  expect(await page.evaluate(key => localStorage.getItem(key), source.key)).toBe(raw);
  if (source.name === 'legacy') expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('rejected-save.png'), animations: 'disabled' });
});
