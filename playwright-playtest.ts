/** Native browser campaigns with six preserved policies and isolated evidence.
 * Run with Node's experimental TypeScript stripping, game count, and an explicit production preview URL.
 * Partial --turns runs are checkpoints and exit with status 2.
 */

import { chromium, type Page, type Locator } from "playwright";
import {expect} from '@playwright/test';
import { writeFileSync } from "node:fs";
import type {Difficulty} from './src/save/saveGame.ts';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createRandomCursor, isRandomState} from './src/engine/random.ts';
import {saveQaSnapshot} from './tests/e2e/qaProgress.ts';
import {startGame, navigateToTab, dismissOverlay, dismissTutorial} from './tests/e2e/helpers.ts';
import {playOneTurnLogged} from './tests/e2e/playthrough.ts';
import {TAB_CONFIG} from './src/data/tabs.ts';
import {parseBrowserArgs, createOutputDirectory, verifyProductionPreview, type BrowserPlaytestOptions} from './tools/browserPlaytestOptions.ts';

declare global {interface Window {__llBrowserPlaytestSeeds?: number[]}}
type PolicyRandom = () => number;

type Strategy = 'build_everything' | 'military_focused' | 'explore_all_tabs' | 'random' | 'trade_focused' | 'speedrun';
interface Persona {name: string; difficulty: Difficulty; strategy: Strategy;}
type MeterKey = 'denarii' | 'food' | 'population' | 'garrison' | 'morale';
type Meters = Partial<Record<MeterKey, number | null>>;
interface Friction {type: 'disabled_builds' | 'meter_critical_low' | 'driver_failure'; turn?: number; count?: number; reasons?: string[]; meter?: MeterKey;
  value?: number; phase?: string; error?: string;}
interface GameLog {
  persona: string | null; difficulty: Difficulty | null;
  turns: Array<{turn: number; meters: Meters}>;
  actions: Array<{action: string; description?: string | null; turn?: number}>;
  disabledClicks: Array<{selector: string; description: string; turn: number}>;
  consoleErrors: string[]; consoleWarnings: string[]; uxFriction: Friction[];
  outcome: 'victory' | 'game_over' | 'checkpoint' | 'error' | null; gameOverReason: string | null;
  seed: number | null;
  /** Last season processed, including a terminal season; checkpoint meters belong to the next management turn. */
  finalTurn: number | null; checkpointManagementTurn: number | null;
  finalMeters: Meters | null; totalTime: number; turnTimes: number[];
  tabsVisited: Set<string>; eventsEncountered: Array<string | null>;
  eventChoices: Array<{event: string | null; choice: string; phase: string}>;
  buildingsBuilt: Array<{turn: number; label: string | null}>;
  tradesMade: Array<{type: 'buy' | 'sell'; turn: number; label: string | null}>;
  flipEncountered: boolean; synergiesUnlocked: string[];
}
type ReportLog = Omit<GameLog, 'tabsVisited'> & {tabsVisited: string[]};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

let DEBUG = false;

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export const PERSONAS: readonly Persona[] = [
  { name: "Impulsive Builder", difficulty: "normal", strategy: "build_everything" },
  { name: "War Kid", difficulty: "normal", strategy: "military_focused" },
  { name: "Cautious Explorer", difficulty: "easy", strategy: "explore_all_tabs" },
  { name: "Random Clicker", difficulty: "normal", strategy: "random" },
  { name: "Trader Kid", difficulty: "normal", strategy: "trade_focused" },
  { name: "Speedrunner", difficulty: "hard", strategy: "speedrun" },
];

function pick<T>(arr: readonly T[], random: PolicyRandom): T {
  const value = arr[Math.floor(random() * arr.length)];
  if (value === undefined) throw new Error('Empty choice list.');
  return value;
}

// ---------------------------------------------------------------------------
// Game log
// ---------------------------------------------------------------------------
export function createGameLog(): GameLog {
  return {
    persona: null, difficulty: null, seed: null, finalTurn: null, checkpointManagementTurn: null,
    turns: [], actions: [], disabledClicks: [],
    consoleErrors: [], consoleWarnings: [],
    uxFriction: [], outcome: null, gameOverReason: null,
    finalMeters: null, totalTime: 0, turnTimes: [],
    tabsVisited: new Set(), eventsEncountered: [],
    eventChoices: [], buildingsBuilt: [], tradesMade: [],
    flipEncountered: false, synergiesUnlocked: [],
  };
}

// ---------------------------------------------------------------------------
async function scrapeMeters(page: Page): Promise<Meters> {
  return page.evaluate(() => {
    const read = (key: string, label: string) => {
      const heading = [...document.querySelectorAll('dl[aria-label="Final estate resources"] dt')]
        .find(node => node.textContent?.trim() === label);
      const node = document.querySelector(`[data-testid="resource-${key}"]`) ?? heading?.parentElement?.querySelector('dd');
      const text = node?.textContent?.replace(/[^0-9.-]/g, '');
      if (!text) return null;
      const value = Number(text);
      return Number.isFinite(value) ? value : null;
    };
    return {denarii: read('denarii', 'Denarii'), food: read('food', 'Food'),
      population: read('families', 'Families'), garrison: read('garrison', 'Garrison'), morale: read('morale', 'Morale')};
  });
}

export async function dismissOverlays(page: Page) {
  await dismissTutorial(page);
  for (let i = 0; i < 15; i++) {
    if (await dismissOverlay(page)) continue;
    const overlay = page.getByRole('button', {name: 'Continue Your Reign', exact: true});
    if (await overlay.isVisible()) {await overlay.click();  continue;}
    const card = page.getByRole('status').filter({hasText: 'Tap to dismiss'});
    if (await card.isVisible()) {
      await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
      const owner = await card.elementHandle();
      if (!owner) throw new Error('Visible notification owner disappeared before clicking.');
      try {
        await card.click();
        // Wait for this queue item, even if another card replaces it with the same label.
        await owner.waitForElementState('hidden');
      } finally {await owner.dispose();}
      continue;
    }
    break;
  }
}

async function clickTab(page: Page, log: GameLog, tabName: string) {
  await navigateToTab(page, tabName);
  log.tabsVisited.add(tabName.toLowerCase());
  await dismissOverlays(page);
}

async function performAction(page: Page, log: GameLog, button: Locator, description: string, turn: number) {
  if (await button.count() === 0) throw new Error(`Required action missing: ${description}`);
  if (!await button.isEnabled()) {log.disabledClicks.push({selector: description, description, turn}); return false;}
  const before = await saveQaSnapshot(page);
  await button.click();
  await dismissOverlays(page);
  const after = await saveQaSnapshot(page);
  if (after.state.turn !== before.state.turn || after.state.rngState !== before.state.rngState) throw new Error(`Management action changed calendar/RNG: ${description}`);
  log.actions.push({action: 'click', description, turn});
  return {before: before.state, after: after.state};
}

async function buildOne(page: Page, log: GameLog, turn: number, cardIndex = 0, farmOnly = false) {
  const cards = page.locator('[data-testid^="build-card-"]');
  if (await cards.count() === 0) throw new Error('Estate build cards missing.');
  const buttons = (farmOnly ? page.getByTestId('build-card-strip_farm') : cards)
    .getByRole('button', {name: /^Build \([\d.]+d\)$/}).filter({visible: true});
  const enabled = buttons.and(page.locator('button:not(:disabled)'));
  if (await enabled.count() === 0) return false;
  const button = enabled.nth(cardIndex % await enabled.count());
  const label = (await button.textContent())?.trim();
  const quoted = label?.match(/\(([\d.]+)d\)/)?.[1];
  if (!label || quoted === undefined) throw new Error('Build quote missing.');
  const result = await performAction(page, log, button, label, turn);
  if (!result) return false;
  if (result.after.buildings.length !== result.before.buildings.length + 1 ||
      result.after.denarii !== result.before.denarii - Number(quoted)) throw new Error('Paid build did not settle its quoted state change.');
  const added = result.after.buildings.find(building => typeof building !== 'string' &&
    !result.before.buildings.some(previous => typeof previous !== 'string' && previous.instanceId === building.instanceId));
  if (!added || typeof added === 'string' || added.condition !== 100) throw new Error('Built instance missing or damaged.');
  await page.getByTestId('built-building-' + added.instanceId).waitFor({state: 'visible'});
  log.buildingsBuilt.push({turn, label: added.type});
  return true;
}

async function trade(page: Page, log: GameLog, turn: number, mode: 'buy' | 'sell', random?: PolicyRandom) {
  const back = page.getByRole('button', {name: /Return to Market Square/});
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', {name: /Quick Trade/}).click();
  const rows = !random && mode === 'buy' ? page.locator('[data-testid="quick-buy-salt"], [data-testid="quick-buy-tools"], [data-testid="quick-buy-spices"]')
    : page.locator(`[data-testid^="quick-${mode}-"]`);
  const ids = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')));
  if (!ids.length) return; // No current sellable inventory is a legal policy outcome.
  const candidates = random ? [pick(ids, random)] : ids;
  for (const id of candidates) {
    if (!id) throw new Error('Quick trade offer has no resource identity.');
    const button = page.getByTestId(id).getByRole('button', {name: mode === 'sell' ? /^Sell all / : /^Buy 1 /});
    if (await button.count() === 0 || !await button.isEnabled()) continue;
    const label = await button.getAttribute('aria-label');
    const quoted = label?.match(/for ([\d.]+)d$/)?.[1];
    if (!label || quoted === undefined) throw new Error('Trade quote missing.');
    const result = await performAction(page, log, button, label, turn);
    if (!result) continue;
    const delta = Number(quoted) * (mode === 'sell' ? 1 : -1);
    if (result.after.denarii !== result.before.denarii + delta || result.after.tradeCount !== result.before.tradeCount + 1) throw new Error('Trade did not settle its quoted state change.');
    log.tradesMade.push({type: mode, turn, label});
  }
}

export async function doManagement(page: Page, log: GameLog, strategy: Strategy, turn: number, random: PolicyRandom) {
  const started = Date.now();
  if (strategy === 'build_everything') {
    await clickTab(page, log, 'Estate');
    const initial = await page.locator('[data-testid^="build-card-"]').count();
    for (let i = 0; i < initial; i++) if (!await buildOne(page, log, turn, i)) break;
  } else if (strategy === 'military_focused') {
    if (turn < 5) {await clickTab(page, log, 'Estate'); await buildOne(page, log, turn, 0, true);}
    else {
      await clickTab(page, log, 'Military');
      for (let i = 0; i < 3; i++) await performAction(page, log,
        page.getByRole('button', {name: 'Recruit +5', exact: true}).first(), 'Recruit +5', turn);
      const upgrades = page.getByRole('button', {name: /^Upgrade \([\d.]+d\)$/}).and(page.locator('button:not(:disabled)'));
      if (await upgrades.count()) await performAction(page, log, upgrades.first(), 'Upgrade fortification', turn);
    }
  } else if (strategy === 'explore_all_tabs') {
    for (const tab of TAB_CONFIG) await clickTab(page, log, tab.label);
    await clickTab(page, log, 'Estate'); await buildOne(page, log, turn);
    await clickTab(page, log, 'People');
    await performAction(page, log, page.locator('button[aria-label*="Set tax rate to Low"]'), 'Tax Low', turn);
  } else if (strategy === 'random') {
    const tabs = ['Estate', 'People'];
    if (turn >= 3) tabs.push('Market');
    if (turn >= 5) tabs.push('Military');
    const tab = pick(tabs, random);
    await clickTab(page, log, tab);
    if (tab === 'Estate') await buildOne(page, log, turn, Math.floor(random() * 17));
    else if (tab === 'Market') await trade(page, log, turn, random() > .5 ? 'sell' : 'buy', random);
    else if (tab === 'People') {
      const rate = pick(['Low', 'Medium', 'High'], random);
      await performAction(page, log, page.locator(`button[aria-label*="Set tax rate to ${rate}"]`), `Tax ${rate}`, turn);
    } else await performAction(page, log, page.getByRole('button', {name: 'Recruit +1', exact: true}).first(), 'Recruit +1', turn);
  } else if (strategy === 'trade_focused') {
    if (turn <= 3) {await clickTab(page, log, 'Estate'); for (let i = 0; i < 2; i++) await buildOne(page, log, turn);}
    if (turn >= 3) {await clickTab(page, log, 'Market'); await trade(page, log, turn, 'sell'); await trade(page, log, turn, 'buy');}
  }
  log.turnTimes.push(Date.now() - started);
}

async function analyzeUX(page: Page, log: GameLog, turn: number) {
  const disabled = page.locator('[data-testid^="build-card-"] button:disabled');
  const count = await disabled.count();
  if (count) {
    const reasons = (await disabled.evaluateAll(buttons => buttons.map(button => button.getAttribute('title')))).filter((value): value is string => value !== null);
    log.uxFriction.push({type: 'disabled_builds', turn, count, reasons: [...new Set(reasons)]});
  }
  const meters = await scrapeMeters(page);
  for (const key of ['denarii', 'food', 'population', 'morale'] as const) {
    const value = meters[key], threshold = key === 'population' ? 3 : key === 'morale' ? 20 : 0;
    if (value != null && value <= threshold) log.uxFriction.push({type: 'meter_critical_low', turn, meter: key, value});
  }
}

// Play a full game
// ---------------------------------------------------------------------------
export async function playGame(page: Page, persona: Persona, idx: number,
  options: BrowserPlaytestOptions, outputDir: string): Promise<GameLog> {
  const log = createGameLog(), started = Date.now(), stem = join(outputDir, `game-${idx + 1}`);
  log.persona = persona.name; log.difficulty = persona.difficulty;
  page.on('console', message => {
    if (message.type() === 'error') log.consoleErrors.push(message.text());
    if (message.type() === 'warning') log.consoleWarnings.push(message.text());
  });
  page.on('pageerror', error => log.consoleErrors.push(error.message));
  page.on('requestfailed', request => log.consoleErrors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => {if (response.status() >= 400) log.consoleErrors.push(`HTTP ${response.status()}: ${response.url()}`);});
  try {
    await page.addInitScript(() => {
      const native = crypto.getRandomValues.bind(crypto), seeds: number[] = [];
      window.__llBrowserPlaytestSeeds = seeds;
      const observe = (array: Parameters<typeof native>[0]) => {
        const result = native(array);
        if (array instanceof Uint32Array && array.length === 1) {
          const seed = array[0]; if (seed === undefined) throw new Error('Missing native seed.'); seeds.push(seed);
        }
        return result;
      };
      Object.defineProperty(crypto, 'getRandomValues', {configurable: true, value: observe});
    });
    await page.goto(options.baseURL);
    await startGame(page, persona.difficulty);
    await dismissOverlays(page);
    const seeds = await page.evaluate(() => window.__llBrowserPlaytestSeeds);
    const seed = seeds?.[0];
    if (seeds?.length !== 1 || !isRandomState(seed)) throw new Error('Fresh native game seed was not observed exactly once.');
    log.seed = seed;
    const policy = createRandomCursor((seed ^ 0x9e3779b9) >>> 0);
    const random = () => policy.next();
    for (let iteration = 0; iteration < options.turnLimit; iteration++) {
      if (Date.now() - started > 300000) throw new Error('Campaign exceeded its five-minute budget.');
      await dismissOverlays(page);
      const initial = (await saveQaSnapshot(page)).state;
      if (initial.phase !== 'management' || initial.turn !== iteration + 1 || initial.difficulty !== persona.difficulty) throw new Error('Unexpected management state.');
      const meters = await scrapeMeters(page);
      for (const key of ['denarii', 'food', 'population', 'garrison'] as const) {
        if (meters[key] !== initial[key]) throw new Error(`Dashboard/save disagreement: ${key}`);
      }
      log.turns.push({turn: initial.turn, meters});
      await doManagement(page, log, persona.strategy, initial.turn, random);
      await analyzeUX(page, log, initial.turn);
      const before = (await saveQaSnapshot(page)).state;
      const result = await playOneTurnLogged(page, outcome => `${stem}-turn-${initial.turn}-${outcome.replaceAll(':', '-')}.png`, async count => {
        const flip = await page.getByText(/Decision \d+ of \d+/).isVisible() || await page.getByRole('group', {name: 'Choose your path', exact: true}).isVisible();
        if (flip) log.flipEncountered = true;
        if (persona.strategy === 'random') return Math.floor(random() * count);
        return !flip && count > 1 && random() > .7 ? 1 : 0;
      });
      log.eventsEncountered.push(...result.events);
      log.eventChoices.push(...result.choices.map(choice => ({event: result.events[0] ?? null, choice, phase: 'turn progression'})));
      log.actions.push({action: 'simulate', turn: initial.turn});
      log.finalTurn = initial.turn;
      if (result.continued) {
        const after = (await saveQaSnapshot(page)).state, next = initial.turn + 1;
        const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
        if (after.phase !== 'management' || after.turn !== next || after.season !== seasons[(next - 1) % 4] || after.year !== Math.floor((next - 1) / 4) + 1) throw new Error('Turn driver did not advance the saved calendar exactly once.');
        log.synergiesUnlocked = [...after.synergies.activated];
        log.flipEncountered ||= Object.values(after.perspectiveFlips).some(Boolean);
        if (initial.turn === 40) throw new Error('Turn 40 returned to management without an ending.');
      } else {
        if (result.outcome === 'victory') {
          if (before.turn !== 40) throw new Error('Victory before turn 40.');
          await page.getByText(/^Ten years have passed/).waitFor({state: 'visible'});
          await page.getByRole('button', {name: 'Reign Again', exact: true}).waitFor({state: 'visible'});
          log.outcome = 'victory';
        } else if (result.outcome?.startsWith('game_over:')) {
          const reason = await page.locator('[data-gameover-reason]').getAttribute('data-gameover-reason');
          if (!reason || !['bankruptcy', 'famine', 'depopulation'].includes(reason)) throw new Error('Unrecognized native loss reason.');
          await page.getByRole('button', {name: 'Try Again', exact: true}).waitFor({state: 'visible'});
          log.outcome = 'game_over'; log.gameOverReason = reason;
        } else throw new Error(`Turn progression stopped: ${result.outcome}`);
        await page.locator('dl[aria-label="Final estate resources"]').waitFor({state: 'visible'});
        if (await page.getByRole('button', {name: /Simulate/}).count()) throw new Error('Ending retains Simulate control.');
        log.finalMeters = await scrapeMeters(page);
        for (const key of ['denarii', 'food', 'population', 'garrison'] as const) if (log.finalMeters[key] == null) throw new Error(`Final ${key} unavailable.`);
        // Terminal saves are unavailable; prior persisted metadata is not final metadata.
        log.synergiesUnlocked = [...before.synergies.activated];
        break;
      }
      if (DEBUG) console.log(`${persona.name}: turn ${initial.turn} advanced`);
    }
    if (log.outcome === null) {
      log.outcome = 'checkpoint'; log.checkpointManagementTurn = (await saveQaSnapshot(page)).state.turn;
      log.finalMeters = await scrapeMeters(page);
    }
  } catch (error) {
    log.outcome = 'error'; log.consoleErrors.push(errorMessage(error));
    log.uxFriction.push({type: 'driver_failure', turn: log.finalTurn ?? undefined, error: errorMessage(error)});
  } finally {
    log.totalTime = Date.now() - started;
    try {await page.screenshot({path: `${stem}.png`, fullPage: true, animations: 'disabled'});}
    catch (error) {log.consoleErrors.push(`Screenshot failed: ${errorMessage(error)}`);}
    writeFileSync(`${stem}.json`, JSON.stringify({...log, tabsVisited: [...log.tabsVisited]}, null, 2));
  }
  return log;
}

export function generateReport(allLogs: readonly ReportLog[]) {
  const lines = [];
  const now = new Date().toISOString().split("T")[0];

  lines.push("# The Lord's Ledger — Playwright Playtest Report");
  lines.push(`> Generated: ${now} | Games: ${allLogs.length} | Method: Headless Playwright + automated personas (not a human usability study)`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Executive Summary
  lines.push("## Executive Summary");
  lines.push("");

  const wins = allLogs.filter((l) => l.outcome === "victory").length;
  const losses = allLogs.filter((l) => l.outcome === "game_over").length;
  const stuck = allLogs.filter((l) => l.outcome === 'error' || l.outcome === null).length;
  const checkpoints = allLogs.filter(l => l.outcome === 'checkpoint').length;
  const gamesWithTurns = allLogs.filter(l => (l.outcome === 'victory' || l.outcome === 'game_over') && l.finalTurn !== null);
  const avgTurns = gamesWithTurns.length > 0
    ? gamesWithTurns.reduce((s, l) => s + (l.finalTurn ?? 0), 0) / gamesWithTurns.length : 0;
  const avgTime = allLogs.length > 0
    ? (allLogs.reduce((s, l) => s + l.totalTime, 0) / allLogs.length / 1000).toFixed(1) : "0";

  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total games | ${allLogs.length} |`);
  lines.push(`| Victories | ${wins} (${Math.round(wins / Math.max(allLogs.length, 1) * 100)}%) |`);
  lines.push(`| Game Overs | ${losses} (${Math.round(losses / Math.max(allLogs.length, 1) * 100)}%) |`);
  lines.push(`| Stuck/Crashed | ${stuck} |`);
  lines.push(`| Partial checkpoints | ${checkpoints} |`);
  lines.push(`| Avg terminal turn (completed games only) | ${avgTurns.toFixed(1)}/40 |`);
  lines.push(`| Avg playthrough time | ${avgTime}s |`);
  lines.push("");

  // Per-Persona Results
  lines.push("## Per-Persona Results");
  lines.push("");
  lines.push("| Persona | Difficulty | Outcome | Last processed season | Checkpoint management turn | Buildings | Trades | Flips | Persisted synergies | Time |");
  lines.push("|---------|-----------|---------|-------|-----------|--------|-------|-----------|------|------|");

  for (const log of allLogs) {
    const turns = log.finalTurn ?? '-';
    const buildings = log.buildingsBuilt.length;
    const trades = log.tradesMade.length;
    const flips = log.flipEncountered ? "Yes" : "No";
    const synergies = log.synergiesUnlocked.length;
    const time = (log.totalTime / 1000).toFixed(1) + "s";
    const outcome = log.outcome === "victory" ? "WIN"
      : log.outcome === 'game_over' ? 'LOSS' : log.outcome === 'checkpoint' ? 'CHECKPOINT' : 'ERROR';
    lines.push(`| ${log.persona} | ${log.difficulty} | ${outcome} | ${turns} | ${log.checkpointManagementTurn ?? '-'} | ${buildings} | ${trades} | ${flips} | ${synergies} | ${time} |`);
  }
  lines.push("");

  // Game Over Analysis
  const gameOvers = allLogs.filter((l) => l.outcome === "game_over");
  if (gameOvers.length > 0) {
    lines.push("## Game Over Analysis");
    lines.push("");
    lines.push("### Death Causes");
    lines.push("");
    const causes: Record<string, number> = {};
    for (const l of gameOvers) {
      const reason = l.gameOverReason || "Unknown";
      causes[reason] = (causes[reason] || 0) + 1;
    }
    for (const [cause, count] of Object.entries(causes).sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${cause}**: ${count}x`);
    }
    lines.push("");

    lines.push("### Death Details");
    lines.push("");
    for (const l of gameOvers) {
      const m = l.finalMeters || {};
      lines.push(`- **${l.persona}** (${l.difficulty}): Died at turn ${l.finalTurn ?? "?"}`);
      lines.push(`  - Reason: ${l.gameOverReason || "?"}`);
      lines.push(`  - Final resources: Denarii:${m.denarii ?? "?"} Food:${m.food ?? "?"} Pop:${m.population ?? "?"} Garrison:${m.garrison ?? "?"} Morale:${m.morale ?? "?"}`);
    }
    lines.push("");
  }

  // Victory Analysis
  const victories = allLogs.filter((l) => l.outcome === "victory");
  if (victories.length > 0) {
    lines.push("## Victory Analysis");
    lines.push("");
    for (const l of victories) {
      const m = l.finalMeters || {};
      lines.push(`- **${l.persona}** (${l.difficulty}): Won at turn ${l.finalTurn ?? "?"}`);
      lines.push(`  - Final resources: Denarii:${m.denarii ?? "?"} Food:${m.food ?? "?"} Pop:${m.population ?? "?"} Garrison:${m.garrison ?? "?"} Morale:${m.morale ?? "?"}`);
      lines.push(`  - Buildings built: ${l.buildingsBuilt.length}, Trades: ${l.tradesMade.length}`);
    }
    lines.push("");
  }

  // UX Friction Points
  lines.push("## UX Friction Points");
  lines.push("");
  lines.push("Observed disabled controls and low resources. These observations do not establish confusion or a gameplay defect.");
  lines.push("");

  const frictionByType: Record<string, Array<Friction & {persona: string | null}>> = {};
  for (const log of allLogs) {
    for (const f of log.uxFriction) {
      frictionByType[f.type] = frictionByType[f.type] || [];
      frictionByType[f.type]?.push({ persona: log.persona, ...f });
    }
  }

  const frictionLabels: Record<string, string> = {
    disabled_builds: "Disabled Build Buttons",
    meter_critical_low: "Low Resource Observations",
    driver_failure: "Driver Failure",
  };

  if (Object.keys(frictionByType).length === 0) {
    lines.push("No friction points detected.");
  } else {
    for (const [type, instances] of Object.entries(frictionByType).sort((a, b) => b[1].length - a[1].length)) {
      const label = frictionLabels[type] || type;
      lines.push(`### ${label}`);
      lines.push(`- **Occurrences**: ${instances.length}`);
      lines.push(`- **Personas affected**: ${[...new Set(instances.map((i) => i.persona))].join(", ")}`);

      if (type === "disabled_builds") {
        const allReasons = instances.flatMap((i) => i.reasons || []);
        const reasonCounts: Record<string, number> = {};
        for (const r of allReasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        if (Object.keys(reasonCounts).length > 0) {
          lines.push("- **Reasons shown**:");
          for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
            lines.push(`  - "${reason}": ${count}x`);
          }
        }
      }

      if (type === "meter_critical_low") {
        const meterCounts: Record<string, number> = {};
        for (const i of instances) meterCounts[i.meter ?? 'unknown'] = (meterCounts[i.meter ?? 'unknown'] || 0) + 1;
        lines.push("- **Meters affected**:");
        for (const [meter, count] of Object.entries(meterCounts).sort((a, b) => b[1] - a[1])) {
          lines.push(`  - ${meter}: ${count}x`);
        }
      }
      lines.push("");
    }
  }

  // Console Errors
  const allErrors = allLogs.flatMap((l) => l.consoleErrors);
  if (allErrors.length > 0) {
    lines.push("## Console Errors");
    lines.push("");
    const unique = [...new Set(allErrors)];
    for (const err of unique.slice(0, 20)) {
      lines.push(`- \`${err.slice(0, 200)}\``);
    }
    lines.push("");
  }

  // Event & Decision Analysis
  lines.push("## Event & Decision Analysis");
  lines.push("");
  lines.push('The shared logger captures heading observations and progression-control labels. Headings can include management UI and repeat across seasons; these are not unique authored event IDs.');
  lines.push("");
  const eventCounts: Record<string, number> = {};
  for (const log of allLogs) {
    for (const e of log.eventsEncountered) eventCounts[e ?? 'unknown'] = (eventCounts[e ?? 'unknown'] || 0) + 1;
  }

  lines.push("### Events Encountered");
  lines.push("");
  if (Object.keys(eventCounts).length === 0) {
    lines.push("No events were encountered (games may have ended before events fired).");
  } else {
    for (const [event, count] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      lines.push(`- **${event}**: ${count}x`);
    }
  }
  lines.push("");

  const allChoices = allLogs.flatMap((l) => l.eventChoices);
  if (allChoices.length > 0) {
    lines.push("### Choices Made");
    lines.push("");
    lines.push("| Event | Choice | Phase |");
    lines.push("|-------|--------|-------|");
    for (const c of allChoices.slice(0, 40)) {
      lines.push(`| ${(c.event || "?").slice(0, 40)} | ${(c.choice || "?").slice(0, 50)} | ${c.phase} |`);
    }
    lines.push("");
  }

  // Building Activity
  lines.push("## Building Activity");
  lines.push("");
  const buildCounts: Record<string, number> = {};
  for (const log of allLogs) {
    for (const b of log.buildingsBuilt) buildCounts[b.label ?? 'unknown'] = (buildCounts[b.label ?? 'unknown'] || 0) + 1;
  }
  if (Object.keys(buildCounts).length === 0) {
    lines.push("No buildings were constructed across all playthroughs.");
  } else {
    lines.push("| Building | Times Built |");
    lines.push("|----------|-------------|");
    for (const [b, count] of Object.entries(buildCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${b} | ${count} |`);
    }
  }
  lines.push("");

  // Tab Usage
  lines.push("## Tab Usage");
  lines.push("");
  const tabUsage: Record<string, number> = Object.fromEntries(TAB_CONFIG.map(tab => [tab.id, 0]));
  for (const log of allLogs) {
    for (const tab of log.tabsVisited) tabUsage[tab] = (tabUsage[tab] || 0) + 1;
  }
  lines.push("| Tab | Games Used |");
  lines.push("|-----|------------|");
  for (const [tab, count] of Object.entries(tabUsage).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${tab.charAt(0).toUpperCase() + tab.slice(1)} | ${count}/${allLogs.length} |`);
  }
  lines.push("");

  // Meter Trajectories
  lines.push("## Meter Trajectories");
  lines.push("");
  for (const log of allLogs) {
    if (log.turns.length === 0) continue;
    lines.push(`### ${log.persona} (${log.difficulty})`);
    lines.push("");
    lines.push("| Turn | Denarii | Food | Population | Garrison | Morale |");
    lines.push("|------|---------|------|------------|----------|--------|");
    for (const t of log.turns) {
      const m = t.meters;
      lines.push(`| ${t.turn} | ${m.denarii ?? "-"} | ${m.food ?? "-"} | ${m.population ?? "-"} | ${m.garrison ?? "-"} | ${m.morale ?? "-"} |`);
    }
    lines.push("");
  }

  lines.push('## Follow-up checks', '');
  lines.push('Automated policy outcomes are not evidence about human learners or a reason to weaken difficulty.');
  if (stuck) lines.push('- Reproduce recorded errors or stalls before accepting this driver.');
  if (checkpoints) lines.push('- Complete partial checkpoints before making campaign claims.');
  if (allLogs.some(log => log.consoleErrors.length)) lines.push('- Investigate recorded console, page, and request errors.');
  if (Object.keys(frictionByType).length) lines.push('- Inspect recorded disabled reasons and resource warnings in the interface; distinguish intentional constraints from defects.');
  lines.push('- Review screenshots and unvisited systems separately; these policies do not establish full interface or accessibility coverage.', '');

  // Appendix
  lines.push("## Appendix: Action Log Summary");
  lines.push("");
  for (const log of allLogs) {
    lines.push(`### ${log.persona}`);
    lines.push(`- Total actions: ${log.actions.length}`);
    lines.push(`- Buildings built: ${log.buildingsBuilt.length}`);
    lines.push(`- Trades made: ${log.tradesMade.length}`);
    lines.push(`- Events faced: ${log.eventsEncountered.length}`);
    lines.push(`- Friction points: ${log.uxFriction.length}`);
    lines.push(`- Console errors: ${log.consoleErrors.length}`);
    lines.push(`- Disabled clicks: ${log.disabledClicks.length}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const options = parseBrowserArgs(process.argv.slice(2));
  DEBUG = options.debug;
  const identity = await verifyProductionPreview(options.baseURL);
  const outputDir = createOutputDirectory(options.output);
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify({options, ...identity}, null, 2));
  const allLogs: ReportLog[] = [];
  const browser = await chromium.launch({headless: true});
  try {
    for (let i = 0; i < options.games; i++) {
      const persona = PERSONAS[(i + options.offset) % PERSONAS.length];
      if (!persona) throw new Error('Persona index out of bounds.');
      const context = await browser.newContext({viewport: {width: 1280, height: 900}});
      try {
        const page = await context.newPage(); page.setDefaultTimeout(10000);
        const log = await playGame(page, persona, i, options, outputDir);
        allLogs.push({...log, tabsVisited: [...log.tabsVisited]});
        console.log(`${log.outcome}: ${persona.name}, seed ${log.seed}, terminal/checkpoint turn ${log.finalTurn}, ${log.consoleErrors.length} errors`);
      } finally {await context.close();}
    }
    const after = await verifyProductionPreview(options.baseURL);
    if (after.sourceFingerprint !== identity.sourceFingerprint || JSON.stringify(after.manifest) !== JSON.stringify(identity.manifest)) throw new Error('Source or served build changed during campaigns.');
    process.exitCode = allLogs.some(log => log.consoleErrors.length || log.outcome === 'error' || log.outcome === null) ? 1
      : allLogs.some(log => log.outcome === 'checkpoint') ? 2 : 0;
  } finally {
    await browser.close();
    writeFileSync(join(outputDir, 'logs.json'), JSON.stringify(allLogs, null, 2));
    writeFileSync(join(outputDir, 'report.md'), generateReport(allLogs));
    console.log(`Evidence: ${outputDir}`);
  }
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) main().catch(error => {
  console.error('Fatal error:', errorMessage(error)); process.exitCode = 1;
});
