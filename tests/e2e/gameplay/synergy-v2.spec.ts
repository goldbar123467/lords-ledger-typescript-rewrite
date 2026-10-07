import type {SynergyTierId} from '../../../src/data/synergies.ts';
import { expect, test, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
import { playOneTurn } from '../helpers.ts';
import { SYNERGY_TIER_MAP } from '../../../src/data/synergies.ts';

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
    const simulated = gameReducer(tithed, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
    const unlocked = gameReducer(gameReducer(simulated,
      { type: 'CONTINUE_TO_RANDOM', payload: { randomEvents: [] } }), { type: 'ADVANCE_TURN' });
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

test('loading the same notification cancels the outgoing dismissal timer', async ({ page }) => {
  let state = newGame();
  state = gameReducer(state, { type: 'BUILD_BUILDING', payload: { buildingId: 'pasture' } });
  state = gameReducer(state, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
  state = gameReducer(gameReducer(state,
    { type: 'CONTINUE_TO_RANDOM', payload: { randomEvents: [] } }), { type: 'ADVANCE_TURN' });
  await loadScenario(page, writeV2Save(state));
  const first = page.getByRole('status').filter({ hasText: "Shepherd's Promise" });
  await expect(first).toHaveCSS('opacity', '1');
  await first.click();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await dismissTutorial(page);
  await expect(first).toHaveCSS('opacity', '1');
  // Deliberately cross the old callback's 400ms deadline; this is a timer-race regression.
  await page.waitForTimeout(650);
  await expect(first).toHaveCSS('opacity', '1');
  await saveState(page);
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  expect(JSON.parse(raw ?? '{}').state.pendingSynergyNotifications.map((item: { tierId: string }) => item.tierId))
    .toEqual(['wool_baron_1']);
});

test('tier-two cards and a tier-three overlay advance without dropping authored text', async ({ page }, testInfo) => {
  const state = newGame();
  state.synergies.activated = ['wool_baron_1', 'wool_baron_2', 'wool_baron_3', 'pious_lord_1', 'pious_lord_2'];
  // Rendering fixture for higher tiers; this does not claim natural achievement.
  const tiers: readonly SynergyTierId[] = ['wool_baron_2', 'pious_lord_2', 'wool_baron_3'];
  state.pendingSynergyNotifications = tiers.map(tierId => {
    const entry = SYNERGY_TIER_MAP[tierId];
    if (!entry) throw new Error(`Missing authored tier ${tierId}`);
    return { tierId, tier: entry.tier.tier, title: entry.tier.title, description: entry.tier.description,
      pathName: entry.path.name, pathIcon: entry.path.icon, pathColor: entry.path.color,
      scribesNote: entry.tier.scribesNote ?? null };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadScenario(page, writeV2Save(state));
  for (const title of ['Merchant of Fleece', 'Patron of the Parish']) {
    const card = page.getByRole('status').filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.screenshot({ path: testInfo.outputPath(`tier-two-${title.replaceAll(' ', '-')}.png`) });
    await card.click();
  }
  const overlay = page.getByRole('dialog', { name: 'Strategy path mastered' });
  await expect(overlay.getByRole('heading', { name: 'Baron of the Golden Fleece' })).toBeVisible();
  await expect(overlay.locator(':scope > div')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('tier-three-390.png') });
  await overlay.getByRole('button', { name: 'Continue Your Reign' }).click();
  await expect(overlay).toHaveCount(0);
  await saveState(page);
  const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  expect(JSON.parse(raw ?? '{}').state.pendingSynergyNotifications).toEqual([]);
});

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

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  for (const dismissal of ['click', 'automatic']) {
    test(`two tier-one unlocks advance by ${dismissal} at ${viewport.width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      let state = newGame();
      for (const buildingId of ['pasture', 'herb_garden'] as const) {
        state = gameReducer(state, { type: 'BUILD_BUILDING', payload: { buildingId } });
      }
      state = gameReducer(state, { type: 'CHAPEL_PAY_TITHE', payload: { amount: 50 } });
      state = gameReducer(state, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: [] } });
      state = gameReducer(gameReducer(state,
        { type: 'CONTINUE_TO_RANDOM', payload: { randomEvents: [] } }), { type: 'ADVANCE_TURN' });
      expect(state.pendingSynergyNotifications.map((entry: { tierId: string }) => entry.tierId))
        .toEqual(['wool_baron_1', 'pious_lord_1']);
      await loadScenario(page, writeV2Save(state));
      const first = page.getByRole('status').filter({ hasText: "Shepherd's Promise" });
      await expect(first).toHaveCSS('opacity', '1');
      if (dismissal === 'click') await first.click();
      else await expect(first).toHaveCount(0, { timeout: 7000 });
      const second = page.getByRole('status').filter({ hasText: 'Keeper of Herbs' });
      await expect(second).toHaveCSS('opacity', '1');
      await page.screenshot({ path: testInfo.outputPath(`second-tier-one-${viewport.width}.png`) });
      await second.click();
      await expect(page.getByRole('status').filter({ hasText: 'Path Unlocked' })).toHaveCount(0);
      const saved = await saveState(page);
      expect(saved.synergies.activated).toEqual(['wool_baron_1', 'pious_lord_1']);
      const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
      expect(JSON.parse(raw ?? '{}').state.pendingSynergyNotifications).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
