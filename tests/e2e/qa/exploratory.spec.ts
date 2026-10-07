/**
 * Exploratory QA — one-off spec used in the current QA cycle to surface
 * user-facing issues beyond the automated persona run. Captures targeted
 * screenshots for UI review and logs any runtime errors.
 */

import { test, expect } from "@playwright/test";
import { startGame, navigateToTab, dismissOverlay } from "../helpers.ts";
// Import the authoritative tab list so spec tours stay in sync with the UI.
// A rename in data/tabs.ts automatically flows into this spec rather than
// silently breaking on stale labels (B-40). Importing the data module
// keeps this independent of the React view and its JSX.
import {playQaTurn} from '../qaProgress.ts';
import { TAB_CONFIG } from "../../../src/data/tabs.ts";
import {runQaAttempt} from '../qaDiagnostics.ts';

test.describe("Exploratory QA cycle", () => {
  test.describe.configure({ timeout: 120_000 });

  test("full tab tour + screenshots", async ({ page }, info) => {
    await runQaAttempt(page, info, 'Exploratory', async ({errors}) => {
      await page.goto("/");
      await page.screenshot({ path: info.outputPath('01-title.png'), fullPage: true });
      await startGame(page, "normal");
      await page.screenshot({ path: info.outputPath('02-dashboard-estate.png'), fullPage: true });

      // Tour every tab except Estate (already captured as 02-dashboard-estate).
      const tabs = TAB_CONFIG.filter((t) => t.id !== "estate").map((t) => t.label);
      for (const tab of tabs) {
        await navigateToTab(page, tab);
        await page.waitForTimeout(250);
        await dismissOverlay(page);
        await page.screenshot({ path: info.outputPath(`tab-${tab.toLowerCase().replace(/\s+/g, "-")}.png`), fullPage: true });
      }

      // Go back to Estate, simulate 3 turns, capture
      await navigateToTab(page, "Estate");
      for (let i = 0; i < 3; i++) {
        expect(await playQaTurn(page, {}), `Exploratory turn ${i + 1} failed to continue`).toBe(true);
        await page.screenshot({ path: info.outputPath(`after-turn-${i + 1}.png`), fullPage: true });
      }

      // Report errors via console.log for log inspection
      if (errors.length) {
        console.log("EXPLORATORY_ERRORS:", JSON.stringify(errors, null, 2));
      }
      expect(errors).toEqual([]);
    });
  });
});
