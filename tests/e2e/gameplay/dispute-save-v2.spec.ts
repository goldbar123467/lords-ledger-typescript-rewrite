import {snapshotFixture} from '../../gameInput.ts';
import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save } from '../../../src/save/saveGame.ts';
import encounters from '../../../src/data/audience.ts';

for (const width of [390, 1366]) for (const kind of ['v2', 'legacy']) {
  test(`damaged dispute history blocks ${kind} load and preserves slots at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'],
      greatHall: { ...base.greatHall, rulingHistory: [null] } };
    const legacy = JSON.stringify(state), v2 = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : null;
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ v2, legacy }) => {
      if (v2 !== null) localStorage.setItem('lords-ledger-v2-save', v2);
      localStorage.setItem('lords-ledger-save', legacy);
    }, { v2, legacy });
    await page.goto('/');
    await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Great Hall');
    await expect(page.getByRole('button', { name: /Normal.*The standard experience/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart manuscript and load' })).toHaveCount(0);
    expect(await page.evaluate(() => ({ v2: localStorage.getItem('lords-ledger-v2-save'), legacy: localStorage.getItem('lords-ledger-save') }))).toEqual({ v2, legacy });
    await page.screenshot({ path: info.outputPath('rejected-dispute-history.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
  test(`compatible dispute history ${kind} save continues and resaves at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'],
      greatHall: { ...base.greatHall, rulingHistory: [{ disputeId: 'dispute_001', rulingId: 'a', decree: 'Older decree wording.', consequences: { people: 0.5 }, turn: 1, season: 'spring' as const, year: 1 },
        { disputeId: 'dispute_001', rulingId: 'a', decree: 'Older decree wording.', consequences: null, turn: 1, season: 'spring' as const, year: 1 }], disputesResolved: 9, stewardTrust: 0 } };
    const legacy = JSON.stringify(state), v2 = kind === 'v2' ? JSON.stringify({ format: 'lords-ledger', version: 2, state }) : null;
    await page.addInitScript(({ v2, legacy }) => {
      if (!localStorage.getItem('lords-ledger-save')) localStorage.setItem('lords-ledger-save', legacy);
      if (v2 !== null && !localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', v2);
    }, { v2, legacy });
    await page.goto('/');
    await page.getByRole('button', { name: kind === 'v2' ? 'Load saved game' : 'Import old save', exact: true }).click();
    await expect(page.getByRole('button', { name: /Trampled Crops/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Audience', exact: true }).click();
    const encounter = encounters[1]; expect(encounter).toBeDefined(); if (!encounter) return;
    await page.getByRole('button', { name: new RegExp(encounter.name) }).click();
    await page.getByRole('button', { name: 'Reveal full petition', exact: true }).click();
    const response = encounter.responses[0]; expect(response).toBeDefined(); if (!response) return;
    await page.getByRole('button', { name: new RegExp(response.label) }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    expect(raw).not.toBeNull(); if (raw === null) throw new Error('Save slot missing');
    const loaded = readV2Save(raw);
    expect(loaded.ok).toBe(true); if (!loaded.ok) return;
    const expected = gameReducer(snapshotFixture(state), { type: 'HALL_AUDIENCE_RESPOND', payload: { encounterId: encounter.id, responseIndex: 0 } });
    expect(loaded.state.greatHall).toEqual(expected.greatHall); expect(loaded.state.rngState).toBe(state.rngState);
    await page.screenshot({ path: info.outputPath('continued-dispute-history.png'), animations: 'disabled' });
    await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
  });
}
