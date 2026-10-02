import { expect, test, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import { playOneTurn } from '../helpers.js';

function newGame() {
  return gameReducer(createInitialState(17), { type: 'START_GAME', payload: { difficulty: 'normal', seed: 17 } });
}

async function dismissTutorial(page: Page) {
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
}

async function loadScenario(page: Page, raw: string) {
  await page.addInitScript(saved => {
    if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', saved);
  }, raw);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await dismissTutorial(page);
}

async function saveState(page: Page) {
  await page.getByRole('button', { name: 'Save game' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  expect(raw).not.toBeNull();
  const saved = readV2Save(raw ?? '');
  if (!saved.ok) throw new Error(saved.error);
  return saved.state;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`tier-one toast clears the season action at ${viewport.width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const built = gameReducer(newGame(), { type: 'BUILD_BUILDING', payload: { buildingId: 'herb_garden' } });
    const tithed = gameReducer(built, { type: 'CHAPEL_PAY_TITHE', payload: { amount: 50 } });
    const unlocked = gameReducer(gameReducer(tithed,
      { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } }), { type: 'ADVANCE_TURN' });
    // Fixture-assisted notification render from reducer-produced state, not a campaign.
    await loadScenario(page, writeV2Save(unlocked));
    const toast = page.getByRole('status').filter({ hasText: 'Path Unlocked' });
    await expect(toast).toContainText('Keeper of Herbs');
    await expect(toast).toHaveCSS('opacity', '1');
    const toastBox = await toast.boundingBox();
    const action = page.getByRole('button', { name: 'Simulate this season' });
    const actionBox = await action.boundingBox();
    if (!toastBox || !actionBox) throw new Error('Toast or season action is missing.');
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(actionBox.y);
    expect(toastBox.x).toBeGreaterThanOrEqual(0);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(viewport.width);
    expect(await toast.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.bottom - 5));
    })).toBe(true);
    expect(await action.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`synergy-toast-${viewport.width}.png`) });
    await toast.click();
    await expect(toast).toHaveCount(0);
    expect((await saveState(page)).synergies.activated).toContain('pious_lord_1');
    expect(errors).toEqual([]);
  });
}

test('Herb Garden needs a real tithe before Pious unlock and persists its reward', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await loadScenario(page, writeV2Save(newGame()));
  await page.getByTestId('build-card-herb_garden').getByRole('button', { name: 'Build (80d)' }).click();
  expect(await playOneTurn(page, {})).toBe(true);
  const low = await saveState(page);
  expect(low.turn).toBe(2);
  expect(low.chapel.faith).toBe(50);
  expect(low.synergies.activated).not.toContain('pious_lord_1');
  await page.getByRole('button', { name: /Chapel tab/ }).click();
  await dismissTutorial(page);
  await page.getByRole('button', { name: /Speak with Father Anselm/ }).click();
  await page.getByRole('spinbutton').fill('50');
  await page.getByRole('button', { name: 'Give', exact: true }).click();
  const tithed = await saveState(page);
  expect(tithed.denarii).toBe(low.denarii - 50);
  expect(tithed.chapel.faith).toBe(62);
  expect(await playOneTurn(page, {})).toBe(true);
  const high = await saveState(page);
  expect(high.turn).toBe(3);
  expect(high.chapel.faith).toBe(63);
  expect(high.synergies.highFaithTurns).toBe(1);
  expect(high.synergies.activated).toContain('pious_lord_1');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const restored = await saveState(page);
  expect(restored.synergies).toEqual(high.synergies);
  expect(restored.chapel.faith).toBe(63);
  expect(errors).toEqual([]);
});

for (const source of ['v2', 'legacy']) {
  test(`${source} save rejects a tier without prerequisites and preserves its bytes`, async ({ page }) => {
    const state = newGame();
    state.synergies.activated = ['wool_baron_3'];
    const raw = JSON.stringify(source === 'v2' ? { format: 'lords-ledger', version: 2, state } : state);
    const key = source === 'v2' ? 'lords-ledger-v2-save' : 'lords-ledger-save';
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
    await page.goto('/');
    await page.getByRole('button', { name: source === 'v2' ? 'Load saved game' : 'Import old save' }).click();
    await expect(page.getByRole('alert')).toContainText('activated synergy list is invalid');
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
    await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
  });
}
