/**
 * Gameplay Tests — Estate Building & Management
 *
 * Verifies building construction, repair, and demolition workflows.
 */

import { test, expect } from "@playwright/test";
import { startGame } from "../helpers.js";
import { gameReducer, initialState } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';

/**
 * Get the current denarii value from the Dashboard.
 *
 * Reads via the `data-testid="resource-denarii"` attribute instead of
 * positional `.text-2xl` indexing (B-29 / B-37).
 */
async function getDenarii(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="resource-denarii"]');
    if (!el) return undefined;
    const parsed = parseInt(el.textContent, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  });
}

async function getPlotUsage(page) {
  const match = (await page.locator('body').innerText()).match(/(\d+)\s*\/\s*(\d+)\s*used/i);
  expect(match, 'Estate must show its used and total plot count').not.toBeNull();
  return { used: Number(match[1]), total: Number(match[2]) };
}

async function buildStripFarm(page) {
  await page.getByTestId('build-card-strip_farm').getByRole('button', { name: 'Build (80d)' }).click();
}

test.describe("Estate Building", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await startGame(page, "easy"); // Easy mode for more starting gold
  });

  test("Build New section is visible with available buildings", async ({
    page,
  }) => {
    await expect(page.getByText("Build New")).toBeVisible();

    await expect(page.getByTestId('build-card-strip_farm').getByRole('button', { name: 'Build (80d)' })).toBeEnabled();
  });

  test("building a Strip Farm costs denarii", async ({ page }) => {
    const initialDenarii = await getDenarii(page);

    expect(initialDenarii).toBe(700);
    await buildStripFarm(page);
    const newDenarii = await getDenarii(page);
    expect(newDenarii).toBe(initialDenarii - 80);
    await expect(page.getByTestId(/built-building-strip_farm-1-seq-/)).toHaveCount(1);
  });

  test("built building appears in Your Buildings section", async ({ page }) => {
    await expect(page.getByTestId(/^built-building-/)).toHaveCount(4);
    await buildStripFarm(page);
    await expect(page.getByTestId(/^built-building-/)).toHaveCount(5);
    await expect(page.getByTestId(/built-building-strip_farm-1-seq-/)).toHaveCount(1);
  });

  test("cannot build when denarii are insufficient", async ({ page }) => {
    const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 } });
    const raw = writeV2Save({ ...started, denarii: 0 });
    await page.evaluate(value => localStorage.setItem('lords-ledger-v2-save', value), raw);
    await page.reload();
    await page.getByRole('button', { name: 'Load saved game' }).click();
    const tutorial = page.getByRole('button', { name: 'I Understand' });
    if (await tutorial.isVisible()) await tutorial.click();
    expect(await getDenarii(page)).toBe(0);
    const stripFarm = page.getByTestId('build-card-strip_farm');
    await expect(stripFarm.getByRole('button', { name: /Need 80d/i })).toBeDisabled();
    await expect(page.getByTestId(/^built-building-/)).toHaveCount(4);
  });

  test("building uses a land plot", async ({ page }) => {
    const initialPlots = await getPlotUsage(page);
    expect(initialPlots).toEqual({ used: 4, total: 24 });
    await buildStripFarm(page);
    expect(await getPlotUsage(page)).toEqual({ used: 5, total: 24 });
  });

  test("demolishing a building frees the land plot", async ({ page }) => {
    await buildStripFarm(page);
    const built = page.getByTestId(/built-building-strip_farm-1-seq-/);
    await expect(built).toHaveCount(1);
    expect(await getPlotUsage(page)).toEqual({ used: 5, total: 24 });
    await built.getByRole('button', { name: 'Demolish' }).click();
    await expect(built).toHaveCount(0);
    expect(await getPlotUsage(page)).toEqual({ used: 4, total: 24 });
    expect(await getDenarii(page)).toBe(660); // 700 - 80 build + 40 half-cost refund
  });

  test("pre-built buildings show condition information", async ({ page }) => {
    const built = page.getByTestId(/^built-building-/);
    await expect(built).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      await expect(built.nth(index).getByText('Condition:')).toBeVisible();
    }
  });
});
