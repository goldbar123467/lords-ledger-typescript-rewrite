import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import seasonalEvents from '../../../src/data/seasonalEvents.ts';
import { getInitialTiers } from '../../../src/data/people.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  test(`partial People save continues with canonical population tiers at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const state = { ...createInitialState(104), phase: 'management' as const, activeTab: 'people', tutorialsSeen: ['people'], people: {} };
    const canonical = gameReducer({ ...state, people: { tiers: getInitialTiers(20) } }, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: Object.values(seasonalEvents).flat() } });
    const raw = writeV2Save(state), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Simulate this season', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Choose your response', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!saved) throw new Error('Missing seasonal save');
    const parsed = readV2Save(saved); if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.people.tiers).toEqual(canonical.people.tiers);
    expect(parsed.state.rngState).toBe(canonical.rngState);
    expect(parsed.state.phase).toBe(canonical.phase);
    await page.screenshot({ path: info.outputPath('seasonal-continuation.png'), animations: 'disabled' });
    await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);
    expect(errors).toEqual([]);
  });
}
