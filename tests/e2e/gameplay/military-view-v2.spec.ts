import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readLegacySave, readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import { SOLDIER_TYPES, WALLS_TRACK, GATE_TRACK, MOAT_TRACK } from '../../../src/data/military.ts';

const imported = readLegacySave(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
if (!imported.ok) throw new Error(imported.error);
const base = imported.state;
function contrast(color: string, background: string) {
  const luminance = (value: string) => {
    const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(channel => {
      const n = Number(channel) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = channels;
    if (r === undefined || g === undefined || b === undefined) throw new Error('Invalid contrast color');
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(color), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
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
  test('prerequisite locks explain the next upgrade and unlock after walls improve', async ({ page }, testInfo) => {
    const state = { ...base, denarii: 1000, activeTab: 'military', tutorialsSeen: ['military'],
      military: { ...base.military, walls: 1, gate: 2, moat: 1,
        scribesNoteSeen: { feudalObligation: true, castleEvolution: true, militaryMorale: true } } };
    await page.evaluate(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const gate = page.getByRole('heading', { name: /^Gate:/ }).locator('..');
    const moat = page.getByRole('heading', { name: /^Moat:/ }).locator('..');
    await gate.screenshot({ path: testInfo.outputPath('blocked-gate.png') });
    for (const card of [gate, moat]) {
      await expect(card).not.toContainText('Maximum fortification reached');
      await expect(card).toContainText('Requires: Stone Curtain Wall');
      await expect(card.getByRole('button', { name: 'Locked', exact: true })).toBeDisabled();
    }
    await expect(gate).toContainText(`Next: ${GATE_TRACK[3].name}`);
    await expect(moat).toContainText(`Next: ${MOAT_TRACK[2].name}`);
    const walls = page.getByRole('heading', { name: /^Walls:/ }).locator('..');
    await walls.getByRole('button', { name: `Upgrade (${WALLS_TRACK[2].cost}d)`, exact: true }).click();
    await expect(gate.getByRole('button', { name: `Upgrade (${GATE_TRACK[3].cost}d)`, exact: true })).toBeEnabled();
    await expect(moat.getByRole('button', { name: `Upgrade (${MOAT_TRACK[2].cost}d)`, exact: true })).toBeEnabled();
    await gate.getByRole('button', { name: `Upgrade (${GATE_TRACK[3].cost}d)`, exact: true }).click();
    const saved = await savedState(page);
    expect(Object.entries(saved.military).find(([key]) => key === 'gate')?.[1]).toBe(3);
    expect(saved.denarii).toBe(1000 - WALLS_TRACK[2].cost - GATE_TRACK[3].cost);
  });
  test('Watchtower entry supports native keyboard activation and visible focus', async ({ page }) => {
    const action = page.getByRole('button', { name: 'Climb the Watchtower', exact: true });
    await expect(action).toBeVisible();
    for (let steps = 0; steps < 60 && !await action.evaluate(element => element === document.activeElement); steps++) {
      await page.keyboard.press('Tab');
    }
    await expect(action).toBeFocused();
    expect(await action.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'I Understand', exact: true }).click();
    await expect(page.getByRole('button', { name: /Horizon Scan/ })).toBeVisible();
  });
  test('soldier headings and negative military status have readable contrast', async ({ page }, testInfo) => {
    for (const name of ['Levy Peasants', 'Men-at-Arms', 'Knights']) {
      const heading = page.getByRole('heading', { name, exact: true });
      expect(contrast(await heading.evaluate(element => getComputedStyle(element).color), 'rgb(35, 30, 22)')).toBeGreaterThanOrEqual(4.5);
    }
    const state = { ...base, activeTab: 'military', tutorialsSeen: ['military'],
      military: { ...base.military, morale: 10 } };
    await page.evaluate(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(state));
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const warning = page.getByText('Low morale — soldiers may desert', { exact: true });
    await warning.locator('..').screenshot({ path: testInfo.outputPath('morale.png') });
    for (const text of [warning, page.getByText('-30% defense', { exact: true }), ...await page.getByText('✗ VULNERABLE', { exact: true }).all()]) {
      expect(contrast(await text.evaluate(element => getComputedStyle(element).color), 'rgb(35, 30, 22)')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
