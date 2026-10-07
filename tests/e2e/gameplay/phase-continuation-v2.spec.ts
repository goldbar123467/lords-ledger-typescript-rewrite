import {test, expect, type Page} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save} from '../../../src/save/saveGame.ts';
import seasonalEvents from '../../../src/data/seasonalEvents.ts';
import randomEvents from '../../../src/data/randomEvents.ts';

const pools = {seasonalEvents: Object.values(seasonalEvents).flat(), randomEvents};

async function dismissNote(page: Page) {
  const note = page.getByRole('dialog', {name: "Scribe's Note"});
  if (await note.isVisible()) await note.getByRole('button', {name: 'Continue', exact: true}).click();
}

async function save(page: Page) {
  await page.getByRole('button', {name: 'Save game', exact: true}).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Native save missing.');
  const loaded = readV2Save(raw);
  if (!loaded.ok) throw new Error(loaded.error);
  expect(writeV2Save(loaded.state)).toBe(raw);
  return loaded.state;
}

for (const width of [390, 1366]) {
  test(`native seasonal continuation requires the random choice before advancing ${width}`, async ({page}, info) => {
    const started = gameReducer(createInitialState(4), {type: 'START_GAME', payload: {seed: 4, difficulty: 'easy'}});
    const simulated = gameReducer(started, {type: 'SIMULATE_SEASON', payload: pools});
    const state = gameReducer(simulated, {type: 'SELECT_SEASONAL_ACTION', payload: {optionIndex: 0}});
    expect(state.phase).toBe('seasonal_resolve');
    const expectedEvent = gameReducer(state, {type: 'CONTINUE_TO_RANDOM', payload: pools}).currentRandomEvent;
    if (!expectedEvent) throw new Error('Seeded random choice missing.');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, writeV2Save(state));
    await page.setViewportSize({width, height: width === 390 ? 844 : 768});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game'}).click();
    await dismissNote(page);
    const before = await save(page);
    expect(before.phase).toBe('seasonal_resolve');
    await page.getByRole('button', {name: 'See What Happens Next', exact: true}).click();
    await expect(page.getByRole('heading', {name: expectedEvent.title, exact: true})).toBeVisible();
    const pending = await save(page);
    expect(pending.phase).toBe('random_event');
    expect(pending.turn).toBe(1);
    expect(pending.currentRandomEvent?.id).toBe('rand_soc_1');
    await page.screenshot({path: info.outputPath('required-random-choice.png'), fullPage: true});
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game'}).click();
    await expect(page.getByRole('heading', {name: expectedEvent.title, exact: true})).toBeVisible();
    await page.getByRole('group', {name: 'Choose your response'}).getByRole('button').first().click();
    await dismissNote(page);
    const chosen = await save(page);
    expect(chosen.phase).toBe('random_resolve');
    expect(chosen.turn).toBe(1);
    expect(chosen.rngState).toBe(pending.rngState);
    await page.getByRole('button', {name: 'Continue', exact: true}).click();
    await page.getByRole('dialog', {name: 'The Estate', exact: true})
      .getByRole('button', {name: 'I Understand', exact: true}).click();
    const advanced = await save(page);
    expect(advanced).toMatchObject({turn: 2, year: 1, season: 'summer', currentRandomEvent: null});
    await page.screenshot({path: info.outputPath('one-calendar-advance.png'), fullPage: true});
    expect(errors).toEqual([]);
  });
}
