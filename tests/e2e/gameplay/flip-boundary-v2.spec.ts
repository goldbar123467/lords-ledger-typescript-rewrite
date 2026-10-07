import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';
import { ALL_FLIPS } from '../../../src/engine/flipEngine.ts';

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  if (!raw) throw new Error('Save is missing');
  return JSON.parse(raw).state;
}

test('saved knight summary applies morale and leaves bankruptcy for the season simulation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = gameReducer(createInitialState(17), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
  const boundary = { ...started, turn: 19, season: 'autumn' as const, year: 5, garrison: 6,
    military: { ...started.military, garrison: { levy: 6, menAtArms: 0, knights: 0 } },
    perspectiveFlips: Object.fromEntries(Object.keys(ALL_FLIPS).filter(id => id !== 'cyoa_knight').map(id => [id, true])),
    raids: { ...started.raids, lastRaidTurn: 19 },
  };
  const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
  const resolved = gameReducer(simulated, { type: 'CONTINUE_TO_RANDOM', payload: { randomEvents: [] } });
  let summary = gameReducer(gameReducer(resolved, { type: 'ADVANCE_TURN' }), { type: 'DISMISS_FLIP_INTRO' });
  for (let step = 0; step < 4; step++) summary = gameReducer(summary, { type: 'SELECT_FLIP_OPTION', payload: { optionIndex: 0 } });
  expect(summary.cyoaEndingType).toBe('good');
  const fixture = { ...summary, denarii: 0, bankruptcyTurns: 5,
    buildings: Array.from({ length: 12 }, (_, index) => ({
      type: 'strip_farm', instanceId: `bankruptcy-farm-${index}`, condition: 100, builtOnTurn: 1,
    })),
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(fixture));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByText('Morale +15', { exact: true })).toBeVisible();
  const returning = page.getByRole('button', { name: 'Return to Your Reign', exact: true });
  await returning.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('knight-summary.png') });
  await returning.click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
  const after = await save(page);
  expect(after.phase).toBe('management');
  expect(after.bankruptcyTurns).toBe(5);
  expect(after.military.morale).toBe(70);
  expect(after.garrison).toBe(7);
  expect(after.military.garrison.levy).toBe(7);
  await page.getByRole('button', { name: 'Load saved game' }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  expect(await save(page)).toEqual(after);
  await page.getByRole('button', { name: 'Simulate this season' }).click();
  await expect(page.locator('[data-gameover-reason="bankruptcy"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Empty Coffer', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('sixth-season-bankruptcy.png') });
  expect(errors).toEqual([]);
});

for (const [taxRate, flipId] of [['high', 'serf_week'], ['medium', 'cyoa_lord']] as const) {
  test(`${flipId} returns from a saved story without repeating seasonal work`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const started = gameReducer(createInitialState(17),
      { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
    // Fixture-assisted turn-seven boundary. The browser traverses the complete story.
    const boundary = { ...started, turn: 7, season: 'autumn' as const, year: 2, taxRate };
    const simulated = gameReducer(boundary, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const entered = gameReducer(gameReducer(simulated,
      { type: 'CONTINUE_TO_RANDOM', payload: { randomEvents: [] } }), { type: 'ADVANCE_TURN' });
    expect(entered.currentFlipId).toBe(flipId);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), writeV2Save(entered));
    await page.goto('/');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    const returnButton = page.getByRole('button', { name: 'Return to Your Reign', exact: true });
    for (let step = 0; step < 32 && !await returnButton.isVisible(); step++) {
      const choice = page.getByRole('button', { name: /^Option 1:/ });
      if (await choice.isVisible()) await choice.click();
      else await page.getByRole('button', { name: /^(Continue|See the Consequences)$/ }).click();
    }
    await expect(returnButton).toBeVisible();
    const summary = await save(page);
    expect(summary.phase).toBe('flip_summary');
    await page.getByRole('button', { name: 'Load saved game' }).click();
    await expect(returnButton).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${flipId}-summary.png`) });
    await returnButton.click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
    const after = await save(page);
    expect(after.phase).toBe('management');
    expect(after.turn).toBe(8);
    expect(after.greatHall.stewardTrust).toBe(48);
    expect(after.greatHall.meterHistory).toEqual(summary.greatHall.meterHistory);
    expect(after.marketPrices).toEqual(summary.marketPrices);
    expect(after.blacksmith).toEqual(summary.blacksmith);
    expect(after.rngState).toBe(summary.rngState);
    expect(after.perspectiveFlips[flipId]).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${flipId}-returned.png`) });
    expect(errors).toEqual([]);
  });
}
