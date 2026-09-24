import { expect, test } from '@playwright/test';
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

const saveKey = 'lords-ledger-v2-save';

test('a seeded Knight\'s Gambit wager uses reducer rules and replays after load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const preWagerSave = writeV2Save(started);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw),
    { key: saveKey, raw: preWagerSave });

  async function playWager() {
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await page.getByRole('button', { name: /Map tab/ }).click();
    if (await tutorial.isVisible()) await tutorial.click();
    await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
    await page.getByRole('button', { name: /Knight's Gambit/ }).click();
    const note = page.getByRole('button', { name: 'I understand' });
    if (await note.isVisible()) await note.click();
    await page.getByRole('button', { name: '25d', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Sword' }).click();
    await expect(page.getByText('DEFEAT', { exact: true })).toBeVisible();
    await expect(page.getByText(/Round 1 of 5/)).toBeVisible();
    await page.getByRole('button', { name: 'Another Round' }).click();
    await page.getByRole('button', { name: '25d', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Shield' }).click();
    await expect(page.getByText('DEFEAT', { exact: true })).toBeVisible();
    await expect(page.getByText(/Round 2 of 5/)).toBeVisible();
    await page.getByRole('button', { name: 'Save game' }).click();
    const raw = await page.evaluate(key => localStorage.getItem(key), saveKey);
    if (!raw) throw new Error('Gambit save is missing.');
    const state = JSON.parse(raw).state;
    expect(state.denarii).toBe(650);
    expect(state.rngState).toBe(3975261312);
    expect(state.tavern.gambitRoundsThisSeason).toBe(2);
    expect(state.tavern.gambitLastChoice).toBe('shield');
    expect(state.tavern.gambitTotalWins).toBe(0);
    expect(state.tavern.gambitTotalLosses).toBe(2);
    return state;
  }

  await page.goto('/');
  const first = await playWager();
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: saveKey, raw: preWagerSave });
  await page.reload();
  const replay = await playWager();
  expect(replay).toEqual(first);
  expect(errors).toEqual([]);
});

test('Gambit choices and result controls fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(started));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', { name: /Knight's Gambit/ }).click();
  const note = page.getByRole('button', { name: 'I understand' });
  if (await note.isVisible()) await note.click();
  await page.getByRole('button', { name: '25d', exact: true }).click();
  for (const name of ['Choose Sword', 'Choose Shield', 'Choose Arrow']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(box.x + box.width).toBeLessThanOrEqual(374);
    }
  }
  await page.getByRole('button', { name: 'Choose Sword' }).click();
  await expect(page.getByText('DEFEAT', { exact: true })).toBeVisible();
  const action = await page.getByRole('button', { name: 'Another Round' }).boundingBox();
  expect(action).not.toBeNull();
  if (action) expect(action.y + action.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('loading a saved game during the reveal cancels the pending wager', async ({ page }) => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 8 } });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw),
    { key: saveKey, raw: writeV2Save(started) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', { name: /Knight's Gambit/ }).click();
  const note = page.getByRole('button', { name: 'I understand' });
  if (await note.isVisible()) await note.click();
  await page.getByRole('button', { name: '50d', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Arrow' }).click();
  await expect(page.getByText('The stranger reaches for...')).toBeVisible();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('heading', { name: "Knight's Gambit" })).toHaveCount(0);
  // Wait beyond the old 800 ms reveal callback to prove it cannot settle after load.
  await page.waitForTimeout(950);
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), saveKey);
  if (!raw) throw new Error('Reloaded Gambit save is missing.');
  const afterLoad = JSON.parse(raw).state;
  expect(afterLoad.denarii).toBe(started.denarii);
  expect(afterLoad.rngState).toBe(started.rngState);
  expect(afterLoad.tavern).toEqual(started.tavern);
  expect(afterLoad.chronicle).toEqual(started.chronicle);
});

test('the fifth Gambit round remains available from the fourth result', async ({ page }) => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const threeRounds = {
    ...started,
    tavern: { ...started.tavern, gambitRoundsThisSeason: 3, gambitLastChoice: 'sword', gambitScribesNoteSeen: true },
  };
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw),
    { key: saveKey, raw: writeV2Save(threeRounds) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /Map tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await page.getByRole('button', { name: /Knight's Gambit/ }).click();
  await page.getByRole('button', { name: '25d', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Sword' }).click();
  await expect(page.getByText(/Round 4 of 5/)).toBeVisible();
  await page.getByRole('button', { name: 'Another Round' }).click();
  await page.getByRole('button', { name: '25d', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Shield' }).click();
  await expect(page.getByText(/^(VICTORY|DEFEAT|DRAW)$/)).toBeVisible();
  await expect(page.getByText(/Round 5 of 5/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Another Round' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), saveKey);
  if (!raw) throw new Error('Fifth-round Gambit save is missing.');
  expect(JSON.parse(raw).state.tavern.gambitRoundsThisSeason).toBe(5);
});
