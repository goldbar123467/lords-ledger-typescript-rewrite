import { test, expect } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import seasonal from '../../../src/data/seasonalEvents.ts';
import random from '../../../src/data/randomEvents.ts';
import { readV2Save, writeV2Save, SAVE_KEY_V2 } from '../../../src/save/saveGame.ts';

for (const width of [1366, 390]) for (const kind of ['seasonal', 'random'] as const) {
  test(`${kind} choice at ${width}px settles resources, note, history and reload`, async ({ page }, info) => {
    const event = kind === 'seasonal' ? seasonal.spring[0] : random[0];
    if (!event) throw new Error('Missing authored event fixture.');
    const base = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 104 } });
    const state = { ...base, phase: kind === 'seasonal' ? 'seasonal_action' : 'random_event',
      currentEvent: kind === 'seasonal' ? event : null, currentRandomEvent: kind === 'random' ? event : null };
    const raw = writeV2Save(state), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw, key: SAVE_KEY_V2 });
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('before-choice.png'), animations: 'disabled' });
    await page.getByRole('group', { name: 'Choose your response' }).getByRole('button').first().click();
    const note = page.getByRole('dialog', { name: "Scribe's Note" });
    await expect(note).toContainText(event.scribesNote ?? '');
    await note.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
    const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
    if (saved === null) throw new Error('Save button did not write a snapshot.');
    const loaded = readV2Save(saved);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state).toMatchObject({ phase: kind === 'seasonal' ? 'seasonal_resolve' : 'random_resolve',
      denarii: kind === 'seasonal' ? 470 : 580, food: kind === 'seasonal' ? 389 : 377,
      population: 20, garrison: 5, rngState: base.rngState, scribesNote: null,
      resourceDeltas: { denarii: kind === 'seasonal' ? -30 : 80, food: kind === 'seasonal' ? 24 : 12, population: 0, garrison: 0 } });
    expect(loaded.state.chronicle.at(-1)?.text).toBe(event.options[0].chronicle);
    expect(loaded.state.causeChain.at(-1)?.summary).toBe(event.options[0].text.slice(0, 80));
    await page.screenshot({ path: info.outputPath('after-choice.png'), animations: 'disabled' });
    await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await expect(page.getByRole('button', { name: kind === 'seasonal' ? 'See What Happens Next' : 'Continue', exact: true })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved);
    expect(errors).toEqual([]);
  });
}
