/** Six native campaigns with per-test reports and diagnostic screenshots. */
import {expect, test} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {runPlaythrough} from '../playthrough.ts';
import type {Difficulty} from '../../../src/save/saveGame.ts';

type Strategy = Parameters<typeof runPlaythrough>[2];
const PLAYTHROUGHS = [
  { difficulty: "easy", strategy: "passive", label: "Easy/Passive" },
  { difficulty: "easy", strategy: "builder", label: "Easy/Builder" },
  { difficulty: "normal", strategy: "balanced", label: "Normal/Balanced" },
  { difficulty: "normal", strategy: "military", label: "Normal/Military" },
  { difficulty: "hard", strategy: "passive", label: "Hard/Passive" },
  { difficulty: "hard", strategy: "builder", label: "Hard/Builder" },
] satisfies readonly {difficulty: Difficulty; strategy: Strategy; label: string}[];

test.describe("Automated Playthroughs", () => {
  // B-53: the six auto-playthrough profiles all hit the same Vite dev server,
  // and running them in parallel saturates it — `page.goto("/")` flakes with
  // `net::ERR_CONNECTION_REFUSED` on 3/6 profiles under default parallelism.
  // Serial mode funnels every playthrough through one worker so the dev
  // server only serves one game at a time. Visual / persona / exploratory
  // specs are unaffected (they live in other projects / directories).
  test.describe.configure({ mode: "serial" });

  for (const run of PLAYTHROUGHS) {
    test(`Full game: ${run.label}`, async ({ page }, info) => {
      test.setTimeout(300_000); // 5 minutes per run
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));

      const result = await runPlaythrough(
        page,
        run.difficulty,
        run.strategy,
        run.label,
        outcome => info.outputPath(`autoplay-${outcome}.png`)
      );

      // Preserve the result even if a terminal assertion fails.
      const reportPath = info.outputPath("playthrough-results.json");
      writeFileSync(reportPath, JSON.stringify([result], null, 2));
      await info.attach("playthrough-results", {path: reportPath, contentType: "application/json"});
      await page.screenshot({path: info.outputPath('campaign-end.png'), animations: 'disabled', fullPage: true});

      // A logged run is not a passed campaign unless it reaches a real ending.
      expect(result.errors, `${run.label} encountered a recovered turn error`).toEqual([]);
      expect(pageErrors, `${run.label} had an uncaught browser error`).toEqual([]);
      expect(result.finalOutcome, `${run.label} stopped without a terminal screen`).toMatch(/^(victory|game_over:.+)$/);
      if (result.finalOutcome === "victory") {
        expect(result.turnsPlayed, `${run.label} declared victory before turn 40`).toBe(40);
      } else {
        await page.getByRole("button", { name: "Try Again" }).click();
        await expect(page.getByRole("button", { name: "Simulate this season" })).toBeVisible();
        await expect(page.getByText(/Spring, Year 1 \(Turn 1\/40\)/)).toBeVisible();
      }

      // Log summary to console
      console.log(
        `\n=== ${run.label} ===\n` +
          `  Turns: ${result.turnsPlayed}, Outcome: ${result.finalOutcome}\n` +
          `  Time: ${result.elapsedSeconds}s, Errors: ${result.errors.length}\n`
      );
    });
  }
});
