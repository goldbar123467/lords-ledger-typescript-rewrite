import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { MORAL_DILEMMAS } from '../../../src/data/chapel.ts';
import { LEGACY_SAVE_KEY, SAVE_KEY_V2, readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) for (const kind of ['v2', 'legacy']) {
  test(`explicit damaged manuscript recovery preserves slots at ${width}px/${kind}`, async ({ page }, info) => {
    const base = createInitialState(104);
    const state = { ...base, phase: 'management' as const, turn: 8, year: 2, season: 'winter' as const,
      denarii: 321, activeTab: 'chapel', tutorialsSeen: ['chapel'], chapel: { ...base.chapel,
        view: 'manuscript', msPhase: 'input', msPattern: [0, 1, 2], msPlayerInput: [null], inventory: ['quill_ink'] } };
    const raw = kind === 'legacy' ? JSON.stringify(state) : JSON.stringify({ format: 'lords-ledger', version: 2, state });
    const otherSlot = writeV2Save({ ...base, denarii: 999 });
    const v2Raw = kind === 'v2' ? raw : otherSlot;
    const legacyRaw = kind === 'legacy' ? raw : JSON.stringify(base);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(({ v2Raw, legacyRaw, v2Key, legacyKey }) => {
      if (!localStorage.getItem(v2Key)) localStorage.setItem(v2Key, v2Raw);
      if (!localStorage.getItem(legacyKey)) localStorage.setItem(legacyKey, legacyRaw);
    }, { v2Raw, legacyRaw, v2Key: SAVE_KEY_V2, legacyKey: LEGACY_SAVE_KEY });
    await page.goto('/');
    await page.getByRole('button', { name: kind === 'legacy' ? 'Import old save' : 'Load saved game', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('manuscript');
    const recovery = page.getByRole('button', { name: 'Restart manuscript and load', exact: true });
    await expect(recovery).toBeVisible();
    const slots = () => page.evaluate(({ v2Key, legacyKey }) => ({ v2: localStorage.getItem(v2Key), legacy: localStorage.getItem(legacyKey) }),
      { v2Key: SAVE_KEY_V2, legacyKey: LEGACY_SAVE_KEY });
    expect(await slots()).toEqual({ v2: v2Raw, legacy: legacyRaw });
    await page.screenshot({ path: info.outputPath('recovery-offer.png'), animations: 'disabled' });
    // Reach the actual recovery action with native keyboard navigation.
    for (let step = 0; step < 50 && !await recovery.evaluate(button => button === document.activeElement); step++) {
      await page.keyboard.press('Tab');
    }
    await expect(recovery).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'The Chapel of St. Dunstan' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Stored saves are unchanged');
    await expect(page.getByText('Recovered', { exact: true })).toBeVisible();
    await expect(page.getByText('Save error', { exact: true })).toHaveCount(0);
    expect(await slots()).toEqual({ v2: v2Raw, legacy: legacyRaw });
    await page.screenshot({ path: info.outputPath('recovery-loaded.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await slots();
    expect(saved.legacy).toBe(legacyRaw);
    if (!saved.v2) throw new Error('Missing recovered v2 save');
    const parsed = readV2Save(saved.v2);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state).toEqual({ ...state, chapel: { ...state.chapel, view: 'nave', msPhase: 'idle',
      msPattern: [], msPlayerInput: [], msRound: 1, msMaxRound: 4, msActiveSymbol: null, msFact: null, msReward: 0 } });
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByRole('heading', { name: 'The Chapel of St. Dunstan' })).toBeVisible();
    await page.getByRole('button', { name: /Enter the Scriptorium/ }).click();
    await expect(page.getByText('Watch the pattern carefully...', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('invalid ownership blocks load and cannot offer manuscript recovery', async ({ page }) => {
  const base = createInitialState(104);
  const state = { ...base, phase: 'management' as const, chapel: { ...base.chapel, inventory: {} } };
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('alert')).toContainText('Chapel inventory');
  await expect(page.getByRole('button', { name: 'Restart manuscript and load' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
});

for (const width of [390, 1366]) {
  test(`older saved Bishop narrative uses current authoritative claim at ${width}px`, async ({ page }) => {
    const base = createInitialState(104);
    const bishop = MORAL_DILEMMAS.find(item => item.id === 'bishops_demand');
    if (!bishop) throw new Error('Bishop definition missing');
    const state = { ...base, phase: 'management' as const, activeTab: 'chapel', tutorialsSeen: ['chapel'],
      chapel: { ...base.chapel, view: 'dilemma', currentDilemma: { ...bishop, narrative: 'An older save says the Bishop demands 10% of the treasury.' } } };
    const raw = writeV2Save(state);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(page.getByText(/He demands an extra tithe/)).toContainText('60 denarii');
    await expect(page.getByText(/An older save says/)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await page.getByRole('button', { name: /Pay in full/ }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const updated = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!updated) throw new Error('Missing resolved Bishop save');
    const read = readV2Save(updated);
    if (!read.ok) throw new Error(read.error);
    expect(read.state.denarii).toBe(440);
  });
}
