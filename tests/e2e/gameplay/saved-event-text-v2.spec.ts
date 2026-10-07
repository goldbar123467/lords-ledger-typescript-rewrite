import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import seasonal from '../../../src/data/seasonalEvents.ts';
import { writeV2Save, SAVE_KEY_V2, LEGACY_SAVE_KEY } from '../../../src/save/saveGame.ts';

const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
for (const kind of ['v2', 'legacy'] as const) for (const field of ['event note', 'choice note', 'choice summary'] as const) {
  test(`${kind} malformed ${field} rejects and preserves both populated slots`, async ({ page }, info) => {
    const authored = seasonal.spring[0];
    const event = { ...authored, ...(field === 'event note' ? { scribesNote: { malformed: true } } : {}),
      options: authored.options.map((option, index) => index === 0 ? { ...option,
        ...(field === 'choice note' ? { scribesNote: { malformed: true } } : {}),
        ...(field === 'choice summary' ? { causeChainSummary: { malformed: true } } : {}) } : option) };
    const state = { ...base, phase: 'seasonal_action' as const, currentEvent: event };
    const bad = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : JSON.stringify(state);
    const v2 = kind === 'v2' ? bad : writeV2Save(base), legacy = kind === 'legacy' ? bad : JSON.stringify(base);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ v2, legacy, currentKey, oldKey }) => {
      localStorage.setItem(currentKey, v2); localStorage.setItem(oldKey, legacy);
    }, { v2, legacy, currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY });
    await page.goto('/'); await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
    await page.screenshot({ path: info.outputPath('load-result.png'), animations: 'disabled' });
    await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(new RegExp(field));
    await page.screenshot({ path: info.outputPath('rejection-ready.png'), animations: 'disabled' });
    expect(await page.evaluate(({ currentKey, oldKey }) => ({ v2: localStorage.getItem(currentKey), legacy: localStorage.getItem(oldKey) }),
      { currentKey: SAVE_KEY_V2, oldKey: LEGACY_SAVE_KEY })).toEqual({ v2, legacy });
    expect(errors).toEqual([]);
  });
}
