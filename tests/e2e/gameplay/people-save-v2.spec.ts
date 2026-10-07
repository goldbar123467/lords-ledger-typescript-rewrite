import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) for (const kind of ['v2', 'legacy']) {
  test(`damaged People roster blocks ${kind} load without changing slots at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, activeTab: 'people', tutorialsSeen: ['people'], people: { ...base.people, notableFamilies: {} } };
    const legacy = JSON.stringify(state), v2 = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : null;
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ v2, legacy, v2Key, legacyKey }) => {
      if (v2 !== null) localStorage.setItem(v2Key, v2);
      localStorage.setItem(legacyKey, legacy);
    }, { v2, legacy, v2Key: SAVE_KEY_V2, legacyKey: LEGACY_SAVE_KEY });
    await page.goto('/');
    await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('People');
    await expect(page.getByRole('button', { name: /Normal.*The standard experience/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart manuscript and load' })).toHaveCount(0);
    expect(await page.evaluate(({ v2Key, legacyKey }) => ({ v2: localStorage.getItem(v2Key), legacy: localStorage.getItem(legacyKey) }),
      { v2Key: SAVE_KEY_V2, legacyKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy });
    await page.screenshot({ path: info.outputPath('rejected-people.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
