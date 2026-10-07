/**
 * Persona QA — Noob, Avg Gamer, Goat Gamer.
 *
 * Personas inspect 6, 8 and 12 turns respectively, log console errors and capture one
 * screenshot at end-of-run. Findings and one-persona summaries are attached
 * under per-test output paths; historical repository reports stay intact.
 */

import {test, expect, type Page, type TestInfo} from '@playwright/test';
import {startGame, dismissOverlay, type TurnDiagnostic, type TurnExitReason} from '../helpers.ts';
import {writeFileSync} from 'node:fs';
import {playQaTurn, saveQaSnapshot} from '../qaProgress.ts';

type Persona = 'Noob' | 'Avg' | 'Goat';
interface QaError {type: 'pageerror' | 'console'; msg: string;}
interface StateSnapshot {innerText: string | null; buttonLabels: string[];}
interface PersonaBug extends StateSnapshot {
  persona: Persona; turn: number; note: string;
  reason: TurnExitReason | 'unknown'; iteration: number | null;
}
interface Finding {persona: Persona; errors: QaError[]; bugs: PersonaBug[];}
interface RecordedFinding extends Finding {ts: string;}

function summarizeFindings(findings: readonly RecordedFinding[], runStart: number) {
  const byPersona: Partial<Record<Persona | 'Unknown', number>> = {};
  const bySeverity = {pageerror: 0, console: 0};
  let totalBugs = 0;
  for (const finding of findings) {
    const persona = finding.persona || 'Unknown';
    byPersona[persona] = (byPersona[persona] || 0) + 1;
    for (const error of finding.errors) bySeverity[error.type] += 1;
    totalBugs += finding.bugs.length;
  }
  return {timestamp: new Date().toISOString(), durationMs: Date.now() - runStart,
    totalFindings: findings.length, totalBugs, byPersona, bySeverity};
}

async function record(finding: Finding, info: TestInfo, runStart: number) {
  // Reports describe this persona attempt; no shared history is read or overwritten.
  const findings: RecordedFinding[] = [{ts: new Date().toISOString(), ...finding}];
  const findingsPath = info.outputPath('qa-findings.json');
  const summaryPath = info.outputPath('qa-summary.json');
  writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
  writeFileSync(summaryPath, JSON.stringify(summarizeFindings(findings, runStart), null, 2));
  await info.attach('qa-findings', {path: findingsPath, contentType: 'application/json'});
  await info.attach('qa-summary', {path: summaryPath, contentType: 'application/json'});
}
// Network/transport noise from the sandboxed CDN (TLS, DNS, connection refused,
// etc.) is not an app-level error and should not count toward the pageerror
// budget or pollute qa-findings.json.
function isNetworkNoise(text: string) {
  if (!text) return false;
  return (
    text.includes("ERR_CERT_AUTHORITY_INVALID") ||
    text.includes("net::ERR_") ||
    /Failed to load resource:.*net::/.test(text)
  );
}

// Capture a lightweight snapshot of the current page state so reviewers can
// distinguish a real softlock from a harness timeout (B-58/B-59). We grab
// the first 400 chars of body text plus up to 20 visible button labels;
// errors are swallowed because this runs on the unhappy path.
async function captureStateSnapshot(page: Page): Promise<StateSnapshot> {
  try {
    const innerText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    const buttonLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter(b => b.offsetParent !== null)
        .slice(0, 20)
        .map(b => (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 60))
        .filter(Boolean)
    );
    return { innerText, buttonLabels };
  } catch {
    return { innerText: null, buttonLabels: [] };
  }
}

async function collectErrors(page: Page) {
  const errors: QaError[] = [];
  page.on("pageerror", (e) => {
    if (isNetworkNoise(e.message)) return;
    errors.push({ type: "pageerror", msg: e.message });
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isNetworkNoise(text)) return;
    errors.push({ type: "console", msg: text });
  });
  return errors;
}

test.describe("Persona QA", () => {
  // Describe-level cap is 180s so the Avg Gamer test (B-45) can run a full
  // 8-turn Normal-difficulty loop + screenshot without the worker tearing
  // down the context. Noob and Goat still set their own 120s cap inline.
  test.describe.configure({ timeout: 180_000 });

  test("Noob — random clicker on easy", async ({ page }, info) => {
    test.setTimeout(120_000);
    const runStart = Date.now();
    const errors = await collectErrors(page);
    await page.goto("/");
    await startGame(page, "easy");
    const bugs: PersonaBug[] = [];

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
        const snapshot = await captureStateSnapshot(page);
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

    await page.screenshot({ path: info.outputPath('qa-noob.png'), fullPage: true });
    await record({ persona: "Noob", errors, bugs }, info, runStart);
    expect(errors).toEqual([]);
    expect(bugs).toEqual([]);
  });

  test("Avg Gamer — builds and simulates", async ({ page }, info) => {
    // Normal-difficulty 8-turn loop + per-turn overlay dismissals regularly
    // runs past the 120s describe default, so give this persona more runway
    // (B-45). Noob/Goat stay at their own 120s budgets.
    test.setTimeout(180_000);
    const runStart = Date.now();
    const errors = await collectErrors(page);
    await page.goto("/");
    await startGame(page, "normal");
    const bugs: PersonaBug[] = [];

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
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    expect((await saveQaSnapshot(page)).raw).toBe(built.raw);
    for (let i = 0; i < 8; i++) {
      const diag: TurnDiagnostic = {};
      const ok = await playQaTurn(page, diag);
      if (!ok) {
        if (diag.reason === 'game_over' || diag.reason === 'victory') break;
        const snapshot = await captureStateSnapshot(page);
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

    await page.screenshot({ path: info.outputPath('qa-avg.png'), fullPage: true });
    await record({ persona: "Avg", errors, bugs }, info, runStart);
    expect(errors).toEqual([]);
    expect(bugs).toEqual([]);
  });

  test("Goat Gamer — methodical full playthrough attempt", async ({ page }, info) => {
    test.setTimeout(120_000);
    const runStart = Date.now();
    const errors = await collectErrors(page);
    await page.goto("/");
    await startGame(page, "hard");
    const bugs: PersonaBug[] = [];

    for (let i = 0; i < 12; i++) {
      const diag: TurnDiagnostic = {};
      const ok = await playQaTurn(page, diag);
      if (!ok) {
        if (diag.reason === 'game_over' || diag.reason === 'victory') break;
        const snapshot = await captureStateSnapshot(page);
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

    await page.screenshot({ path: info.outputPath('qa-goat.png'), fullPage: true });
    await record({ persona: "Goat", errors, bugs }, info, runStart);
    expect(errors).toEqual([]);
    expect(bugs).toEqual([]);
  });
});
