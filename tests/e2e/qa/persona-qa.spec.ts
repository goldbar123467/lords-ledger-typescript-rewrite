/**
 * Persona QA — Noob, Avg Gamer, Goat Gamer.
 *
 * Personas inspect 6, 8 and 12 turns respectively, log console errors and capture one
 * screenshot at end-of-run. Findings and one-persona summaries are attached
 * under per-test output paths; historical repository reports stay intact.
 */

import {test, expect} from '@playwright/test';
import {startGame, dismissOverlay, type TurnDiagnostic} from '../helpers.ts';
import {runQaAttempt, captureQaSnapshot} from '../qaDiagnostics.ts';
import {playQaTurn, saveQaSnapshot} from '../qaProgress.ts';

test.describe("Persona QA", () => {
  // Describe-level cap is 180s so the Avg Gamer test (B-45) can run a full
  // 8-turn Normal-difficulty loop + screenshot without the worker tearing
  // down the context. Noob and Goat still set their own 120s cap inline.
  test.describe.configure({ timeout: 180_000 });

  test("Noob — random clicker on easy", async ({ page }, info) => {
    test.setTimeout(120_000);
    await runQaAttempt(page, info, 'Noob', async ({errors, bugs}) => {
      await page.goto("/");
      await startGame(page, "easy");

      for (let i = 0; i < 6; i++) {
        // Click every visible tab in random order
        const tabs = ["Estate", "Map", "Market", "Military", "People", "Chapel"];
        const tab = tabs[Math.floor(Math.random() * tabs.length)];
        if (tab === undefined) throw new Error('Random tab index is out of bounds.');
        const btn = page.locator(`button[aria-label*="${tab}"]`).first();
        await expect(btn).toBeVisible();
        await btn.click();
        await page.waitForTimeout(200);
        await dismissOverlay(page);
        const diag: TurnDiagnostic = {};
        const ok = await playQaTurn(page, diag);
        if (!ok) {
          if (diag.reason === 'game_over' || diag.reason === 'victory') break;
          const snapshot = await captureQaSnapshot(page);
          bugs.push({
            persona: "Noob",
            turn: i,
            note: "game ended / stuck before turn " + i,
            reason: diag.reason || "unknown",
            iteration: diag.iteration ?? null,
            ...snapshot,
          });
          break;
        }
      }

      expect(errors).toEqual([]);
      expect(bugs).toEqual([]);
    });
  });

  test("Avg Gamer — builds and simulates", async ({ page }, info) => {
    // Normal-difficulty 8-turn loop + per-turn overlay dismissals regularly
    // runs past the 120s describe default, so give this persona more runway
    // (B-45). Noob/Goat stay at their own 120s budgets.
    test.setTimeout(180_000);
    await runQaAttempt(page, info, 'Avg', async ({errors, bugs}, {reload}) => {
      await page.goto("/");
      await startGame(page, "normal");

      // A real paid farm is required before the management profile begins.
      await page.getByRole('button', {name: /Estate tab/}).click();
      await dismissOverlay(page);
      const beforeBuild = await saveQaSnapshot(page);
      const farmsBefore = beforeBuild.state.buildings.filter(building =>
        (typeof building === 'string' ? building : building.type) === 'strip_farm');
      expect(farmsBefore).toHaveLength(0);
      const build = page.getByTestId('build-card-strip_farm').getByRole('button', {name: 'Build (80d)', exact: true});
      await expect(build).toBeEnabled();
      await build.click();
      await dismissOverlay(page);
      const built = await saveQaSnapshot(page);
      expect(built.state.denarii).toBe(beforeBuild.state.denarii - 80);
      expect(built.state.buildings).toHaveLength(beforeBuild.state.buildings.length + 1);
      const farm = built.state.buildings.find(building =>
        (typeof building === 'string' ? building : building.type) === 'strip_farm');
      if (!farm || typeof farm === 'string' || !farm.instanceId) throw new Error('Paid farm instance is missing.');
      expect(farm.condition).toBe(100);
      expect(built.state.rngState).toBe(beforeBuild.state.rngState);
      await expect(page.getByTestId(`built-building-${farm.instanceId}`)).toBeVisible();
      await page.screenshot({path: info.outputPath('paid-farm.png'), animations: 'disabled'});
      await reload();
      await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
      expect((await saveQaSnapshot(page)).raw).toBe(built.raw);
      for (let i = 0; i < 8; i++) {
        const diag: TurnDiagnostic = {};
        const ok = await playQaTurn(page, diag);
        if (!ok) {
          if (diag.reason === 'game_over' || diag.reason === 'victory') break;
          const snapshot = await captureQaSnapshot(page);
          bugs.push({
            persona: "Avg",
            turn: i,
            note: "ended early",
            reason: diag.reason || "unknown",
            iteration: diag.iteration ?? null,
            ...snapshot,
          });
          break;
        }
      }

      expect(errors).toEqual([]);
      expect(bugs).toEqual([]);
    });
  });

  test("Goat Gamer — methodical full playthrough attempt", async ({ page }, info) => {
    test.setTimeout(120_000);
    await runQaAttempt(page, info, 'Goat', async ({errors, bugs}) => {
      await page.goto("/");
      await startGame(page, "hard");

      for (let i = 0; i < 12; i++) {
        const diag: TurnDiagnostic = {};
        const ok = await playQaTurn(page, diag);
        if (!ok) {
          if (diag.reason === 'game_over' || diag.reason === 'victory') break;
          const snapshot = await captureQaSnapshot(page);
          bugs.push({
            persona: "Goat",
            turn: i,
            note: "ended early",
            reason: diag.reason || "unknown",
            iteration: diag.iteration ?? null,
            ...snapshot,
          });
          break;
        }
      }

      expect(errors).toEqual([]);
      expect(bugs).toEqual([]);
    });
  });
});
