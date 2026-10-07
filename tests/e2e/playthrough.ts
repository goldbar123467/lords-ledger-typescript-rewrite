import type {Page} from '@playwright/test';
import {startGame, dismissTutorial, dismissOverlay, progressionButtons} from './helpers.ts';
import type {Difficulty} from '../../src/save/saveGame.ts';

type DiagnosticPath = (outcome: Outcome) => string;
type Strategy = 'passive' | 'builder' | 'military' | 'balanced';
type Outcome = 'sim_button_missing' | 'possible_softlock' | 'victory' | `game_over:${string}` | `crash:${string}`;
interface DiagnosticSnapshot {visibleText: string; buttons: string[];}
type Resources = Awaited<ReturnType<typeof getResources>>;
interface TurnEntry {
  turn: number | null; season: string | null; year: number | null;
  resources: Resources | null; events: string[]; choices: string[];
  diagnostics?: DiagnosticSnapshot;
}
interface TurnResult {
  continued: boolean; events: string[]; choices: string[];
  outcome: Outcome | null; diagnostics?: DiagnosticSnapshot;
}
interface RunResult {
  runId: string; difficulty: Difficulty; strategy: Strategy; turnsPlayed: number;
  finalOutcome: Outcome | null; elapsedSeconds: number; turnData: TurnEntry[];
  actionLog: string[]; errors: string[]; diagnostics?: DiagnosticSnapshot;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract dashboard resource values via DOM.
 *
 * Reads each value via its `data-testid="resource-<key>"` attribute instead
 * of positional `.text-2xl` indexing (B-29 / B-37). Missing testids resolve
 * to `null` so existing callers stay backward compatible.
 */
async function getResources(page: Page) {
  return page.evaluate(() => {
    const readResource = (key: string) => {
      const el = document.querySelector(`[data-testid="resource-${key}"]`);
      if (!el) return null;
      const parsed = parseInt(el.textContent ?? "", 10);
      return Number.isNaN(parsed) ? null : parsed;
    };
    return {
      denarii: readResource("denarii"),
      food: readResource("food"),
      families: readResource("families"),
      garrison: readResource("garrison"),
    };
  });
}

/** Get current turn and season info from the dashboard */
async function getTurnInfo(page: Page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const turnMatch = text.match(/Turn\s+(\d+)\s*\/\s*40/);
    const seasonMatch = text.match(/(Spring|Summer|Autumn|Winter),\s*Year\s*(\d+)/);
    return {
      turn: turnMatch?.[1] === undefined ? null : parseInt(turnMatch[1], 10),
      season: seasonMatch?.[1] ?? null,
      year: seasonMatch?.[2] === undefined ? null : parseInt(seasonMatch[2], 10),
    };
  });
}

/** Collect visible text about events/choices made */
async function getVisibleEventText(page: Page) {
  return page.evaluate(() => {
    // Look for event card title/description
    const headings = Array.from(document.querySelectorAll("h3, h2"));
    const texts = headings
      .map((h) => (h.textContent ?? "").trim())
      .filter((t) => t.length > 3 && t.length < 200);
    return texts.slice(0, 3);
  });
}

/**
 * Attempt management-phase actions with varied strategies.
 * Strategy parameter controls what actions the bot prioritizes.
 */
async function doManagementActions(page: Page, turn: number, strategy: Strategy, log: string[]) {
  await dismissTutorial(page);

  if (strategy === "builder") {
    await tryBuildSomething(page, turn, log);
  } else if (strategy === "military") {
    await tryRecruitSoldiers(page, log);
  } else if (strategy === "balanced") {
    // Alternate between building and military each turn
    if (turn % 2 === 1) {
      await tryBuildSomething(page, turn, log);
    } else {
      await tryRecruitSoldiers(page, log);
    }
  }
  // "passive" strategy: do nothing, just simulate

  // Always return to estate tab after actions
  const estateTab = page.locator('button[aria-label*="Estate"]');
  if (await estateTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await estateTab.click();
    await page.waitForTimeout(200);
    await dismissTutorial(page);
  }
}

/** Try to build the first affordable building */
async function tryBuildSomething(page: Page, turn: number, log: string[]) {
  const estateTab = page.locator('button[aria-label*="Estate"]');
  if (await estateTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await estateTab.click();
    await page.waitForTimeout(300);
    await dismissTutorial(page);
  }

  // Find any enabled Build button
  const buildButtons = page.locator("button").filter({ hasText: /^Build \(/ });
  const count = await buildButtons.count();
  for (let i = 0; i < count; i++) {
    const btn = buildButtons.nth(i);
    if (await btn.isEnabled({ timeout: 300 }).catch(() => false)) {
      const btnText = await btn.textContent();
      await btn.click();
      await page.waitForTimeout(300);
      log.push(`Turn ${turn}: Built — ${btnText}`);
      await dismissOverlay(page);
      return;
    }
  }
}

/** Try to recruit soldiers */
async function tryRecruitSoldiers(page: Page, log: string[]) {
  const milTab = page.locator('button[aria-label*="Military"]');
  if (await milTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await milTab.click();
    await page.waitForTimeout(300);
    await dismissTutorial(page);
  }

  const recruitBtn = page.locator("button").filter({ hasText: /Recruit \+/ }).first();
  if (await recruitBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    if (await recruitBtn.isEnabled({ timeout: 300 }).catch(() => false)) {
      const btnText = await recruitBtn.textContent();
      await recruitBtn.click();
      await page.waitForTimeout(300);
      log.push(`Recruited: ${btnText}`);
      await dismissOverlay(page);
    }
  }
}

/**
 * Capture a diagnostic snapshot of the visible page (text + button labels)
 * plus a full-page screenshot for triage. Called on blocking outcomes
 * (sim_button_missing, possible_softlock) per B-48.
 */
async function captureDiagnostics(page: Page, diagnosticPath: DiagnosticPath, outcome: Outcome): Promise<DiagnosticSnapshot> {
  const snapshot = await page
    .evaluate(() => {
      const visibleText = document.body.innerText.slice(0, 800);
      const buttons = Array.from(document.querySelectorAll("button"))
        .filter((b) => {
          const rect = b.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 20)
        .map((b) => (b.textContent || "").trim().slice(0, 60));
      return { visibleText, buttons };
    })
    .catch(() => ({ visibleText: "", buttons: [] }));


  try {
    await page.screenshot({
      path: diagnosticPath(outcome),
      fullPage: true,
    });
  } catch {
    // Screenshot failure must not break the test
  }

  return snapshot;
}

/**
 * Play one full turn with event logging. Returns:
 *  { continued: bool, events: string[], choicesMade: string[], outcome: string|null }
 */
export async function playOneTurnLogged(page: Page, diagnosticPath: DiagnosticPath,
  chooseIndex?: (count: number) => number | Promise<number>): Promise<TurnResult> {
  const events: string[] = [];
  const choices: string[] = [];

  // Dismiss any tutorial or overlay before looking for sim button
  await dismissOverlay(page);
  await dismissTutorial(page);

  const simBtn = page.locator('button[aria-label*="Simulate"]');
  if (!(await simBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
    const diagnostics = await captureDiagnostics(
      page,
      diagnosticPath,
      "sim_button_missing"
    );
    return {
      continued: false,
      events,
      choices,
      outcome: "sim_button_missing",
      diagnostics,
    };
  }
  await simBtn.click();

  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(250);

    // Check game end states
    if (
      await page
        .getByText("Try Again", { exact: true })
        .isVisible({ timeout: 200 })
        .catch(() => false)
    ) {
      // Capture game-over reason from data attribute (BUG 1 fix)
      const reasonText = await page.evaluate(() => {
        const el = document.querySelector('[data-gameover-reason]');
        if (el) return el.getAttribute('data-gameover-reason');
        const body = document.body.innerText;
        const match = body.match(
          /(depopulat|bankrupt|population.*reached.*0|denarii.*0|no.*families)/i
        );
        return match ? match[0] : "unknown";
      });
      return { continued: false, events, choices, outcome: `game_over:${reasonText}` };
    }

    if (
      await page
        .getByText("Reign Again", { exact: true })
        .isVisible({ timeout: 200 })
        .catch(() => false)
    ) {
      return { continued: false, events, choices, outcome: "victory" };
    }

    // Check if back in management
    if (await simBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      if (!(await dismissOverlay(page))) {
        return { continued: true, events, choices, outcome: null };
      }
      continue;
    }

    // Capture event text before making choices
    const eventTexts = await getVisibleEventText(page);
    if (eventTexts.length > 0) {
      events.push(...eventTexts.filter((t) => !events.includes(t)));
    }

    // Priority 1: Dismiss overlays (scribe's note, tutorial, raid)
    const overlayBtns = progressionButtons(page, '.fixed.inset-0 button:visible');
    const overlayCount = await overlayBtns.count();
    if (overlayCount > 0) {
      const btnText = await overlayBtns.last().textContent().catch(() => "");
      await overlayBtns.last().click({ timeout: 2_000 });
      if (btnText) choices.push(btnText.trim().substring(0, 60));
      continue;
    }

    // Priority 2: Event/flip choices — pick randomly for variety
    const choiceBtns = page.locator('[role="group"] button');
    const choiceCount = await choiceBtns.count();
    if (choiceCount > 0 && await choiceBtns.first().isVisible({ timeout: 200 }).catch(() => false)) {
      const idx = chooseIndex ? await chooseIndex(choiceCount) : Math.floor(Math.random() * choiceCount);
      if (!Number.isSafeInteger(idx) || idx < 0 || idx >= choiceCount) throw new Error('Choice selector returned an invalid index.');
      const choiceText = await choiceBtns.nth(idx).textContent().catch(() => "");
      // Scroll the page down to ensure event options clear the sticky dashboard
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);
      await choiceBtns.nth(idx).click({ timeout: 5_000 });
      choices.push(`Choice[${idx + 1}/${choiceCount}]: ${(choiceText ?? '').trim().substring(0, 80)}`);
      continue;
    }

    // Both drivers use the same finite, anchored progression controls.
    const continueBtn = progressionButtons(page);
    if (
      await continueBtn
        .first()
        .isVisible({ timeout: 200 })
        .catch(() => false)
    ) {
      const txt = await continueBtn.last().textContent().catch(() => "");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);
      await continueBtn.last().click({ timeout: 5_000 });
      if (txt) choices.push(txt.trim().substring(0, 60));
      continue;
    }
  }

  // If we exhausted the loop, check if we're stuck
  const stillSim = await simBtn.isVisible({ timeout: 500 }).catch(() => false);
  if (!stillSim) {
    const diagnostics = await captureDiagnostics(
      page,
      diagnosticPath,
      "possible_softlock"
    );
    return {
      continued: false,
      events,
      choices,
      outcome: "possible_softlock",
      diagnostics,
    };
  }
  return {
    continued: true,
    events,
    choices,
    outcome: null,
  };
}

/**
 * Run a full game playthrough. Returns structured result data.
 */
export async function runPlaythrough(page: Page, difficulty: Difficulty, strategy: Strategy, runId: string, diagnosticPath: DiagnosticPath): Promise<RunResult> {
  const turnData: TurnEntry[] = [];
  const actionLog: string[] = [];
  const errors = [];
  let finalOutcome: Outcome | null = null;
  let finalDiagnostics: DiagnosticSnapshot | null = null;
  let turnsPlayed = 0;
  const startTime = Date.now();

  await page.goto("/");
  await startGame(page, difficulty);

  // Initial snapshot
  const initRes = await getResources(page);
  const initTurn = await getTurnInfo(page);
  turnData.push({
    turn: initTurn.turn,
    season: initTurn.season,
    year: initTurn.year,
    resources: initRes,
    events: [],
    choices: [],
  });

  for (let t = 0; t < 42; t++) {
    // Safety margin above 40 turns
    try {
      // Do management actions based on strategy
      await doManagementActions(page, t + 1, strategy, actionLog);

      // Play the turn
      const result = await playOneTurnLogged(page, diagnosticPath);
      turnsPlayed++;

      // Snapshot resources after turn
      let postRes = null;
      let postTurn = null;
      if (result.continued) {
        postRes = await getResources(page);
        postTurn = await getTurnInfo(page);
      }

      const turnEntry: TurnEntry = {
        turn: postTurn?.turn ?? turnsPlayed + 1,
        season: postTurn?.season ?? null,
        year: postTurn?.year ?? null,
        resources: postRes,
        events: result.events.slice(0, 5),
        choices: result.choices.slice(0, 5),
      };
      if (result.diagnostics) {
        turnEntry.diagnostics = result.diagnostics;
      }
      turnData.push(turnEntry);

      if (!result.continued) {
        finalOutcome = result.outcome;
        if (result.diagnostics) {
          finalDiagnostics = result.diagnostics;
        }
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Turn ${t + 1}: ${message}`);
      // Try to recover
      const canContinue = await page
        .locator('button[aria-label*="Simulate"]')
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (!canContinue) {
        finalOutcome = `crash:${message.substring(0, 100)}`;
        break;
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const payload: RunResult = {
    runId,
    difficulty,
    strategy,
    turnsPlayed,
    finalOutcome,
    elapsedSeconds: parseFloat(elapsed),
    turnData,
    actionLog,
    errors,
  };

  // Attach top-level diagnostics when the run stopped on a blocking outcome
  // so consumers can inspect the payload without digging into turnData (B-48).
  if (
    finalDiagnostics &&
    (finalOutcome === "sim_button_missing" ||
      finalOutcome === "possible_softlock")
  ) {
    payload.diagnostics = finalDiagnostics;
  }

  return payload;
}
