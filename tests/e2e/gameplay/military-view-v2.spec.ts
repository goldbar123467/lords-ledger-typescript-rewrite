import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readLegacySave, readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import { SOLDIER_TYPES, WALLS_TRACK, GATE_TRACK, MOAT_TRACK } from '../../../src/data/military.ts';

const imported = readLegacySave(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
if (!imported.ok) throw new Error(imported.error);
const base = imported.state;
async function savedState(page: Page) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('No v2 save was written');
  const result = readV2Save(raw);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
for (const width of [390, 1366]) test.describe(`Military actions at ${width}px`, () => {
  test.beforeEach(async ({ page }) => {
    const state = { ...base, denarii: 1000, population: 50, activeTab: 'military',
      military: { ...base.military, scribesNoteSeen: { feudalObligation: true, castleEvolution: true, militaryMorale: true } } };
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: 'I Understand', exact: true }).click();
  });
  test('all soldier types charge exact recruitment costs and dismiss without refunds', async ({ page }) => {
    let balance = 1000;
    for (const soldier of Object.values(SOLDIER_TYPES)) {
      const card = page.getByRole('heading', { name: soldier.name, exact: true }).locator('../../..');
      const recruit = card.getByRole('button', { name: 'Recruit +1', exact: true });
      await expect(recruit).toBeEnabled();
      await recruit.click();
      balance -= soldier.recruitCost;
      let state = await savedState(page);
      expect(state.denarii).toBe(balance);
      expect(state.garrison).toBe(6);
      expect(state.military.garrison[soldier.id]).toBe(soldier.id === 'levy' ? 6 : 1);
      const dismiss = card.getByRole('button', { name: 'Dismiss -1', exact: true });
      await expect(dismiss).toBeEnabled();
      await dismiss.click();
      state = await savedState(page);
      expect(state.denarii).toBe(balance);
      expect(state.garrison).toBe(5);
      expect(state.military.garrison[soldier.id]).toBe(soldier.id === 'levy' ? 5 : 0);
    }
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    expect((await savedState(page)).denarii).toBe(balance);
  });
  test('each fortification upgrades exactly one level with the authored debit', async ({ page }) => {
    let balance = 1000;
    for (const [label, track, next] of [
      ['Walls', 'walls', WALLS_TRACK[2]], ['Gate', 'gate', GATE_TRACK[1]], ['Moat', 'moat', MOAT_TRACK[1]],
    ] as const) {
      const card = page.getByRole('heading', { name: new RegExp(`^${label}:`) }).locator('..');
      const upgrade = card.getByRole('button', { name: `Upgrade (${next.cost}d)`, exact: true });
      await expect(upgrade).toBeEnabled();
      await upgrade.click();
      balance -= next.cost;
      await expect(card.getByRole('heading')).toHaveText(`${label}: ${next.name}`);
      const state = await savedState(page);
      expect(state.denarii).toBe(balance);
      const military = state.military;
      expect(Object.entries(military).find(([key]) => key === track)?.[1]).toBe(next.level);
      expect(Object.entries(state).find(([key]) => key === 'castleLevel')?.[1]).toBe(2);
    }
  });
});
