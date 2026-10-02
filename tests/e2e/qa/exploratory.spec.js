/**
 * Exploratory QA — one-off spec used in the current QA cycle to surface
 * user-facing issues beyond the automated persona run. Captures targeted
 * screenshots for UI review and logs any runtime errors.
 */

import { test } from "@playwright/test";
import { startGame, navigateToTab, dismissOverlay, playOneTurn } from "../helpers.js";
import { resolve } from "path";
// Import the authoritative tab list so spec tours stay in sync with the UI.
// A rename in data/tabs.ts automatically flows into this spec rather than
// silently breaking on stale labels (B-40). Importing the data module
// keeps this independent of the React view and its JSX.
import { TAB_CONFIG } from "../../../src/data/tabs.ts";

const SHOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "playtest-screenshots", "qa-cycle");

test.describe("Exploratory QA cycle", () => {
  test.describe.configure({ timeout: 120_000 });

  test("full tab tour + screenshots", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push({ type: "pageerror", msg: e.message }));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("ERR_CERT")) {
        errors.push({ type: "console", msg: msg.text() });
      }
    });

    await page.goto("/");
    await page.screenshot({ path: `${SHOT_DIR}/01-title.png`, fullPage: true });
    await startGame(page, "normal");
    await page.screenshot({ path: `${SHOT_DIR}/02-dashboard-estate.png`, fullPage: true });

    // Tour every tab except Estate (already captured as 02-dashboard-estate).
    const tabs = TAB_CONFIG.filter((t) => t.id !== "estate").map((t) => t.label);
    for (const tab of tabs) {
      await navigateToTab(page, tab);
      await page.waitForTimeout(250);
      await dismissOverlay(page);
      await page.screenshot({ path: `${SHOT_DIR}/tab-${tab.toLowerCase().replace(/\s+/g, "-")}.png`, fullPage: true });
    }

    // Go back to Estate, simulate 3 turns, capture
    await navigateToTab(page, "Estate");
    for (let i = 0; i < 3; i++) {
      await playOneTurn(page);
      await page.screenshot({ path: `${SHOT_DIR}/after-turn-${i + 1}.png`, fullPage: true });
    }

    // Report errors via console.log for log inspection
    if (errors.length) {
      console.log("EXPLORATORY_ERRORS:", JSON.stringify(errors, null, 2));
    }
  });
});
