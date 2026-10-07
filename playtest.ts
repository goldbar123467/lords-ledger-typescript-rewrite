/**
 * playtest.ts — Headless automated playtest for The Lord's Ledger
 *
 * Runs N seeded games through the 40-turn loop with different strategy profiles, dispatching
 * the full action cycle through the game reducer. No React/DOM needed.
 *
 * Usage: node --experimental-strip-types playtest.ts [numRuns] [uint32 seed] [difficulty]
 *   Default: 20 runs (3–4 per strategy)
 *
 * Output:
 *   [BUG]  — Invariant violation (state corruption)
 *   [WARN] — Balance concern (gameplay issue)
 *   [INFO] — Milestone / progress
 */

import { gameReducer, createInitialState } from "./src/engine/gameReducer.ts";
import seasonalEventsData from "./src/data/seasonalEvents.ts";
import randomEventsData from "./src/data/randomEvents.ts";
import {ALL_FLIPS, isFlipId} from './src/engine/flipEngine.ts';
import BUILDINGS, {BUILDING_LIST, type BuildingId} from "./src/data/buildings.ts";
import { FOOD_RESOURCES } from "./src/data/economy.ts";
import type {ResourceId} from './src/data/economy.ts';
import type {GameCommand} from './src/engine/gameCommands.ts';
import type {GameSnapshot, Difficulty} from './src/save/saveGame.ts';
import type {SavedEvent} from './src/save/savedEvent.ts';
import {createRandomCursor, DEFAULT_SEED, isRandomState} from './src/engine/random.ts';
import {pathToFileURL} from 'node:url';
import {canUpgradeFortification, type FortificationTrack} from './src/data/military.ts';
import {readV2Save, writeV2Save} from './src/save/saveGame.ts';

export const STRATEGY_NAMES = ['passive', 'builder', 'trader', 'military', 'pious', 'random'] as const;
export type StrategyName = typeof STRATEGY_NAMES[number];
interface Strategy {
  builds: readonly BuildingId[] | 'random';
  taxRate: GameSnapshot['taxRate'] | 'random';
  trades: boolean | 'random';
  optionPick: 'first' | 'random';
  sellAll?: boolean; buySpices?: boolean; recruit?: boolean;
  upgradeCastle?: boolean; installDefenses?: boolean; donate?: boolean;
}
type PolicyRandom = () => number;

// ---------------------------------------------------------------------------
// Flatten seasonal events (same as App.jsx)
// ---------------------------------------------------------------------------
const seasonalEvents = Object.values(seasonalEventsData).flat();
const randomEvents = randomEventsData;

const VALID_BUILDING_IDS = new Set(Object.keys(BUILDINGS));

// ---------------------------------------------------------------------------
// Strategy profiles
// ---------------------------------------------------------------------------
const STRATEGIES: Record<StrategyName, Strategy> = {
  passive: {
    builds: [],
    taxRate: "medium",
    trades: false,
    optionPick: "first",
  },
  builder: {
    builds: ["strip_farm", "pasture", "fishpond", "strip_farm", "pasture", "brewery"],
    taxRate: "low",
    trades: false,
    optionPick: "first",
  },
  trader: {
    builds: ["pasture", "pasture", "strip_farm"],
    taxRate: "medium",
    trades: true,
    sellAll: true,
    optionPick: "first",
  },
  military: {
    builds: ["iron_mine", "quarry", "strip_farm"],
    taxRate: "high",
    trades: false,
    optionPick: "first",
    recruit: true,
    upgradeCastle: true,
    installDefenses: true,
  },
  pious: {
    builds: ["herb_garden", "strip_farm", "fishpond", "apiary"],
    taxRate: "low",
    trades: true,
    buySpices: true,
    optionPick: "first",
    donate: true,
  },
  random: {
    builds: "random",
    taxRate: "random",
    trades: "random",
    optionPick: "random",
  },
};

// ---------------------------------------------------------------------------
// Dispatch helper — wraps reducer call
// ---------------------------------------------------------------------------
function reduceAction(state: GameSnapshot, action: GameCommand) {
  return gameReducer(state, action);
}

function resourceSnapshot(state: GameSnapshot) {
  return {denarii: state.denarii, food: state.food, population: state.population,
    garrison: state.garrison, morale: state.military.morale ?? 50,
    faith: state.chapel.faith ?? 50, piety: state.chapel.piety ?? 0};
}

// ---------------------------------------------------------------------------
// Invariant checks — returns array of bug strings
// ---------------------------------------------------------------------------
export function checkInvariants(state: GameSnapshot, turn: number, strategyName: StrategyName) {
  const bugs = [];
  const prefix = `[${strategyName} T${turn}]`;

  // Concrete resources must be finite/nonnegative; morale, faith and piety are bounded at 100.
  const resources = resourceSnapshot(state);
  for (const [name, value] of Object.entries(resources)) {
    if (!Number.isFinite(value) || value < 0 ||
        (['morale', 'faith', 'piety'].includes(name) && value > 100)) {
      bugs.push(`[BUG] ${prefix} Meter ${name} out of range: ${value}`);
    }
  }

  // No negative inventory
  for (const [res, qty] of Object.entries(state.inventory)) {
    if (!Number.isFinite(qty) || qty < 0) {
      bugs.push(`[BUG] ${prefix} Inventory ${res} negative: ${qty}`);
    }
  }

  // Food consistency: state.food should equal sum of food resources
  const computedFood = FOOD_RESOURCES.reduce((sum, r) => sum + (state.inventory[r] || 0), 0);
  if (state.food !== computedFood) {
    bugs.push(`[BUG] ${prefix} Food mismatch: state.food=${state.food}, computed=${computedFood}`);
  }

  // Buildings only contain valid IDs
  for (const building of state.buildings) {
    const bid = typeof building === 'string' ? building : building.type;
    if (!VALID_BUILDING_IDS.has(bid)) {
      bugs.push(`[BUG] ${prefix} Invalid building ID: ${bid}`);
    }
  }

  const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
  if (!Number.isInteger(state.turn) || state.turn < 1 || state.turn > 40 ||
      state.season !== seasons[(state.turn - 1) % 4] || state.year !== Math.floor((state.turn - 1) / 4) + 1) {
    bugs.push(`[BUG] ${prefix} Invalid calendar: ${state.turn}/${state.season}/${state.year}`);
  }
  const soldiers = Object.values(state.military.garrison).reduce((sum, count) => sum + count, 0);
  if (soldiers !== state.garrison) bugs.push(`[BUG] ${prefix} Garrison mismatch: ${state.garrison}/${soldiers}`);
  if (state.phase === 'victory' && state.turn !== 40) bugs.push(`[BUG] ${prefix} Premature victory`);
  if (state.phase === 'game_over' && !state.gameOverReason) bugs.push(`[BUG] ${prefix} Loss without a reason`);
  try {
    const saved = writeV2Save(state);
    const loaded = readV2Save(saved);
    if (!loaded.ok || writeV2Save(loaded.state) !== saved) bugs.push(`[BUG] ${prefix} Save roundtrip failed`);
  } catch (error) {
    bugs.push(`[BUG] ${prefix} Save rejected: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Synergy activated: no duplicates
  const activated = state.synergies?.activated ?? [];
  const uniqueActivated = new Set(activated);
  if (uniqueActivated.size !== activated.length) {
    bugs.push(`[BUG] ${prefix} Duplicate synergy IDs in activated: ${JSON.stringify(activated)}`);
  }

  // Synergy notifications have required fields
  for (const notif of state.pendingSynergyNotifications ?? []) {
    if (notif.tier === undefined || !notif.title || !notif.pathIcon) {
      bugs.push(`[BUG] ${prefix} Synergy notification missing fields: ${JSON.stringify(notif)}`);
    }
  }

  return bugs;
}

// ---------------------------------------------------------------------------
// Pick an option index based on strategy
// ---------------------------------------------------------------------------
function pickOption(event: SavedEvent | null, strategy: Strategy, random: PolicyRandom) {
  if (!event?.options?.length) return 0;
  if (strategy.optionPick === "random") {
    return Math.floor(random() * event.options.length);
  }
  return 0; // "first"
}

// ---------------------------------------------------------------------------
// Management phase actions for a given strategy
// ---------------------------------------------------------------------------
function doManagementActions(state: GameSnapshot, strategy: Strategy, buildQueue: BuildingId[], random: PolicyRandom, dispatch: typeof reduceAction) {
  // 1. Set tax rate
  if (strategy.taxRate === "random") {
    const rates: Array<GameSnapshot['taxRate']> = ["low", "medium", "high", "crushing"];
    const rate = rates[Math.floor(random() * rates.length)];
    if (rate === undefined) throw new Error('Policy tax index is out of bounds.');
    state = dispatch(state, { type: "SET_TAX_RATE", payload: { rate } });
  } else if (strategy.taxRate) {
    state = dispatch(state, { type: "SET_TAX_RATE", payload: { rate: strategy.taxRate } });
  }

  // 2. Build from queue
  if (strategy.builds === "random") {
    // Try to build a random building
    const allIds = BUILDING_LIST.map(building => building.id);
    const shuffled = allIds;
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      const current = shuffled[index], other = shuffled[target];
      if (current === undefined || other === undefined) throw new Error('Policy shuffle index is out of bounds.');
      shuffled[index] = other;
      shuffled[target] = current;
    }
    for (const bid of shuffled) {
      const before = state.buildings.length;
      state = dispatch(state, { type: "BUILD_BUILDING", payload: { buildingId: bid } });
      if (state.buildings.length > before) break; // built one
    }
  } else if (buildQueue.length > 0) {
    const nextBuild = buildQueue[0];
    if (nextBuild === undefined) throw new Error('Build queue unexpectedly empty.');
    const before = state.buildings.length;
    state = dispatch(state, { type: "BUILD_BUILDING", payload: { buildingId: nextBuild } });
    if (state.buildings.length > before) {
      buildQueue.shift(); // successfully built, remove from queue
    }
  }

  // 3. Trade
  const shouldTrade = strategy.trades === "random"
    ? random() > 0.5
    : strategy.trades;

  if (shouldTrade && state.phase === "management") {
    // Sell: sell tradeable goods from inventory
    if (strategy.sellAll || strategy.trades === "random") {
      const sellable: ResourceId[] = ["wool", "cloth", "honey", "herbs", "ale", "timber", "clay", "iron", "stone"];
      for (const res of sellable) {
        const qty = state.inventory[res] || 0;
        if (qty > 0) {
          const sellQty = strategy.trades === "random"
            ? Math.ceil(random() * qty)
            : qty;
          state = dispatch(state, { type: "SELL_RESOURCE", payload: { resource: res, quantity: sellQty } });
        }
      }
    }

    // Buy spices (pious strategy) or random goods
    if (strategy.buySpices && state.denarii >= 25) {
      state = dispatch(state, { type: "BUY_RESOURCE", payload: { resource: "spices", quantity: 1 } });
    }
    if (strategy.trades === "random" && state.denarii > 50) {
      const buyable: ResourceId[] = ["grain", "livestock", "fish", "timber", "clay", "iron", "stone", "salt", "tools", "spices"];
      const res = buyable[Math.floor(random() * buyable.length)];
      if (res === undefined) throw new Error('Policy resource index is out of bounds.');
      state = dispatch(state, { type: "BUY_RESOURCE", payload: { resource: res, quantity: Math.ceil(random() * 3) } });
    }
  }

  // 4. Recruit soldiers
  if (strategy.recruit && state.denarii >= 10) {
    state = dispatch(state, { type: "RECRUIT_SOLDIERS", payload: { count: 2 } });
  }
  if (strategy.builds === "random" && random() > 0.7 && state.denarii >= 10) {
    state = dispatch(state, { type: "RECRUIT_SOLDIERS", payload: { count: Math.ceil(random() * 3) } });
  }

  // 5. Upgrade castle
  if (strategy.upgradeCastle) {
    state = dispatch(state, { type: "UPGRADE_FORTIFICATION", payload: {track: 'walls'} });
  }

  // 6. Install defense upgrades
  if (strategy.installDefenses) {
    const tracks: FortificationTrack[] = ['gate', 'moat'];
    for (const track of tracks) {
      if (canUpgradeFortification(track, state.military).canUpgrade) {
        const before = state;
        state = dispatch(state, { type: "UPGRADE_FORTIFICATION", payload: {track} });
        if (state === before) continue;
        break; // One per turn
      }
    }
  }

  // 7. Donate to church
  if (strategy.donate && state.denarii >= 75) {
    state = dispatch(state, { type: "CHAPEL_PAY_TITHE", payload: { amount: 75 } });
  }
  if (strategy.builds === "random" && random() > 0.8 && state.denarii >= 25) {
    state = dispatch(state, { type: "CHAPEL_PAY_TITHE", payload: { amount: 25 } });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Handle perspective flip sequence
// ---------------------------------------------------------------------------
function handleFlipSequence(state: GameSnapshot, strategy: Strategy, random: PolicyRandom, dispatch: typeof reduceAction) {
  // flip_intro → DISMISS_FLIP_INTRO → flip_decision
  state = dispatch(state, { type: "DISMISS_FLIP_INTRO" });

  const flip = isFlipId(state.currentFlipId) ? ALL_FLIPS[state.currentFlipId] : null;
  if (!flip) return state;

  // Both linear decisions and branching stories use the production command flow.
  for (let i = 0; i < 100; i++) {
    if (state.phase !== "flip_decision") break;
    const decision = flip.type === 'cyoa'
      ? (state.currentCyoaNodeId === null ? undefined : flip.nodes[state.currentCyoaNodeId])
      : flip.decisions[state.currentDecisionIndex];
    if (!decision || !('options' in decision) || !decision.options?.length) throw new Error('Flip decision has no authored choices.');
    const optionIndex = strategy.optionPick === "random"
      ? Math.floor(random() * decision.options.length)
      : 0;

    state = dispatch(state, { type: "SELECT_FLIP_OPTION", payload: { optionIndex } });

    if (state.phase === "flip_outcome") {
      state = dispatch(state, { type: "CONTINUE_FLIP" });
    }

    if (state.phase === "flip_summary") break;
  }

  // Dismiss summary
  if (state.phase === "flip_summary") {
    state = dispatch(state, { type: "DISMISS_FLIP_SUMMARY" });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Drain synergy notifications
// ---------------------------------------------------------------------------
function drainSynergyNotifications(state: GameSnapshot, dispatch: typeof reduceAction) {
  let safety = 50;
  while ((state.pendingSynergyNotifications?.length ?? 0) > 0 && safety-- > 0) {
    state = dispatch(state, { type: "DISMISS_SYNERGY_NOTIFICATION" });
  }
  return state;
}

// ---------------------------------------------------------------------------
// Run a single full game
// ---------------------------------------------------------------------------
export function runGame(strategyName: StrategyName, seed: number = DEFAULT_SEED, difficulty: Difficulty = 'normal') {
  const policy = createRandomCursor((seed ^ 0x9e3779b9) >>> 0);
  const random = () => policy.next();
  const strategy = STRATEGIES[strategyName];
  const buildQueue = strategy.builds === "random"
    ? []
    : [...(strategy.builds || [])];

  const allBugs = [];
  const warnings = [];
  const turnHistory = []; // resources immediately before each production season command
  const synergyLog: Array<{turn: number; ids: string[]}> = [];
  let flipCount = 0;
  let denariiZeroStreak = 0;
  let maxDenariiZeroStreak = 0;
  const actions: Array<{turn: number; phase: GameSnapshot['phase']; type: GameCommand['type']; changed: boolean}> = [];
  const dispatch: typeof reduceAction = (before, action) => {
    const next = reduceAction(before, action);
    actions.push({turn: before.turn, phase: before.phase, type: action.type, changed: next !== before});
    allBugs.push(...checkInvariants(next, next.turn, strategyName));
    return next;
  };

  // Start the game
  let state = dispatch(createInitialState(seed), { type: "START_GAME", payload: {seed, difficulty} });

  let maxIterations = 200; // safety limit

  while (state.phase !== "game_over" && state.phase !== "victory" && maxIterations-- > 0) {
    const iterationStart = state;
    const turn = state.turn;

    // --- Management phase ---
    if (state.phase === "management") {
      state = doManagementActions(state, strategy, buildQueue, random, dispatch);

      // Record state before simulation
      turnHistory.push({
        turn,
        resources: resourceSnapshot(state),
      });

      // Simulate season
      state = dispatch(state, {
        type: "SIMULATE_SEASON",
        payload: { seasonalEvents },
      });

    }

    if (state.phase === 'raid_warning') state = dispatch(state, {type: 'RAID_DEFEND'});
    if (state.phase === 'raid_result') state = dispatch(state, {type: 'RAID_CONTINUE'});

    // --- Seasonal action ---
    if (state.phase === "seasonal_action") {
      const optionIndex = pickOption(state.currentEvent, strategy, random);
      state = dispatch(state, {
        type: "SELECT_SEASONAL_ACTION",
        payload: { optionIndex },
      });

    }

    // --- Seasonal resolve → random event ---
    if (state.phase === "seasonal_resolve") {
      state = dispatch(state, {
        type: "CONTINUE_TO_RANDOM",
        payload: { randomEvents },
      });
    }

    // --- Random event ---
    if (state.phase === "random_event") {
      const optionIndex = pickOption(state.currentRandomEvent, strategy, random);
      state = dispatch(state, {
        type: "SELECT_RANDOM_RESPONSE",
        payload: { optionIndex },
      });

    }

    // --- Random resolve → advance turn ---
    if (state.phase === "random_resolve") {
      state = dispatch(state, { type: "ADVANCE_TURN" });
    }

    // --- Handle perspective flip ---
    if (state.phase === "flip_intro") {
      flipCount++;
      state = handleFlipSequence(state, strategy, random, dispatch);
    }

    // --- Drain synergy notifications ---
    if (state.phase !== 'game_over' && state.phase !== 'victory') state = drainSynergyNotifications(state, dispatch);

    // --- Track synergies activated this turn ---
    const newSynergies = (state.synergies?.activated ?? []).filter(
      (id) => !synergyLog.some((entry) => entry.ids.includes(id))
    );
    if (newSynergies.length > 0) {
      synergyLog.push({ turn: state.turn, ids: newSynergies });
    }

    // --- Phase stuck detection ---
    if (state === iterationStart) {
      allBugs.push(`[BUG] [${strategyName} T${state.turn}] Stuck in phase: ${state.phase}`);
      break;
    }

    // --- Balance tracking ---
    // Denarii zero streak
    if (state.denarii === 0) {
      denariiZeroStreak++;
      if (denariiZeroStreak > maxDenariiZeroStreak) maxDenariiZeroStreak = denariiZeroStreak;
    } else {
      denariiZeroStreak = 0;
    }

    // Low-value observations supplement the complete resource history.
    for (const [meter, value] of Object.entries({morale: state.military.morale ?? 50,
      faith: state.chapel.faith ?? 50, piety: state.chapel.piety ?? 0})) {
      if (value <= 10) {
        warnings.push(`[WARN] [${strategyName} T${state.turn}] Low ${meter}: ${value}`);
      }
    }

  }

  if (maxIterations <= 0) {
    allBugs.push(`[BUG] [${strategyName}] Exceeded max iterations, stuck in phase: ${state.phase}`);
  }

  if (maxDenariiZeroStreak >= 3) {
    warnings.push(`[WARN] [${strategyName}] Zero denarii for ${maxDenariiZeroStreak} consecutive turns`);
  }

  return {
    strategyName,
    seed, difficulty, policyDraws: policy.draws,
    outcome: state.phase, // "victory" | "game_over"
    finalTurn: state.turn,
    gameOverReason: state.gameOverReason,
    finalResources: resourceSnapshot(state),
    finalDenarii: state.denarii,
    finalPopulation: state.population,
    bugs: allBugs,
    warnings,
    synergyLog,
    flipCount,
    buildingsBuilt: state.buildings?.length ?? 0,
    synergiesActivated: state.synergies?.activated ?? [],
    turnHistory,
    finalState: state,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Main — run all playthroughs and summarize
// ---------------------------------------------------------------------------
export function parseArgs(args: readonly string[]): {runs: number; seed: number; difficulty: Difficulty} {
  if (args.length > 3) throw new Error('Usage: playtest.ts [positive runs] [uint32 seed] [easy|normal|hard]');
  const runs = args[0] === undefined ? 20 : Number(args[0]);
  const seed = args[1] === undefined ? DEFAULT_SEED : Number(args[1]);
  const difficulty = args[2] ?? 'normal';
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('Run count must be a positive safe integer.');
  if (!isRandomState(seed) || args[1]?.trim() === '') throw new Error('Seed must be an unsigned 32-bit integer.');
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') throw new Error('Unknown difficulty.');
  return {runs, seed, difficulty};
}

type RunResult = ReturnType<typeof runGame>;
export function main(args: string[] = process.argv.slice(2)) {
  const {runs: NUM_RUNS, seed, difficulty} = parseArgs(args);
  const strategyNames = STRATEGY_NAMES;

  console.log(`\n=== The Lord's Ledger — Automated Playtest ===`);
  console.log(`Running ${NUM_RUNS} games across ${strategyNames.length} strategies...\n`);

  const results = [];
  let totalBugs = 0;
  let totalWarnings = 0;

  for (let i = 0; i < NUM_RUNS; i++) {
    // Round-robin through strategies, with extra randoms
    const stratIdx = i % strategyNames.length;
    const strategyName = strategyNames[stratIdx];
    if (strategyName === undefined) throw new Error('Strategy index is out of bounds.');

    const result = runGame(strategyName, (seed + i) >>> 0, difficulty);
    results.push(result);

    // Print bugs immediately
    for (const bug of result.bugs) {
      console.log(bug);
      totalBugs++;
    }

    // Print first few warnings per game (cap to avoid noise)
    const warnCap = 3;
    for (let w = 0; w < Math.min(result.warnings.length, warnCap); w++) {
      console.log(result.warnings[w]);
    }
    if (result.warnings.length > warnCap) {
      console.log(`  ... and ${result.warnings.length - warnCap} more warnings`);
    }
    totalWarnings += result.warnings.length;

    // Info line
    const outcomeIcon = result.outcome === "victory" ? "WIN" : result.outcome === 'game_over' ? 'LOSS' : 'STALLED';
    const reason = result.gameOverReason
      ? result.gameOverReason.type
      : "";
    const synCount = result.synergiesActivated.length;
    console.log(
      `[INFO] Game ${i + 1}/${NUM_RUNS}: ${result.strategyName.padEnd(10)} ` +
      `${outcomeIcon} T${String(result.finalTurn).padStart(2)} | ` +
      `Seed ${result.seed} ${result.difficulty} | Food ${result.finalResources.food} Garrison ${result.finalResources.garrison} Faith ${result.finalResources.faith} | ` +
      `${result.finalDenarii}d ${result.finalPopulation}pop | ` +
      `${synCount} synergies ${result.flipCount} flips` +
      (reason ? ` | ${reason}` : "")
    );
  }

  // ---------------------------------------------------------------------------
  // Summary table
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  // Per-strategy breakdown
  const byStrategy = new Map<StrategyName, RunResult[]>();
  for (const name of strategyNames) {
    byStrategy.set(name, results.filter((r) => r.strategyName === name));
  }

  console.log("\nStrategy      | Games | Wins | Losses | Win% | Avg Turn | Avg Synergies | Flips");
  console.log("-".repeat(85));

  for (const [name, games] of byStrategy) {
    const wins = games.filter((g) => g.outcome === "victory").length;
    const losses = games.filter((g) => g.outcome === "game_over").length;
    const winPct = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;
    const avgTurn = games.length > 0
      ? (games.reduce((s, g) => s + g.finalTurn, 0) / games.length).toFixed(1)
      : "N/A";
    const avgSyn = games.length > 0
      ? (games.reduce((s, g) => s + g.synergiesActivated.length, 0) / games.length).toFixed(1)
      : "N/A";
    const totalFlips = games.reduce((s, g) => s + g.flipCount, 0);

    console.log(
      `${name.padEnd(14)}| ${String(games.length).padStart(5)} | ${String(wins).padStart(4)} | ${String(losses).padStart(6)} | ${String(winPct).padStart(3)}% | ${String(avgTurn).padStart(8)} | ${String(avgSyn).padStart(13)} | ${String(totalFlips).padStart(5)}`
    );
  }

  // Death causes
  console.log("\nDeath Causes:");
  const deathCauses: Record<string, number> = {};
  for (const r of results) {
    if (r.gameOverReason) {
      const key = r.gameOverReason.type;
      deathCauses[key] = (deathCauses[key] || 0) + 1;
    }
  }
  if (Object.keys(deathCauses).length === 0) {
    console.log("  (none recorded)");
  } else {
    for (const [cause, count] of Object.entries(deathCauses).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cause}: ${count}`);
    }
  }

  // Synergy activation frequency
  console.log("\nSynergy Activation Counts:");
  const synergyCounts: Record<string, number> = {};
  for (const r of results) {
    for (const id of r.synergiesActivated) {
      synergyCounts[id] = (synergyCounts[id] || 0) + 1;
    }
  }
  if (Object.keys(synergyCounts).length === 0) {
    console.log("  (none activated across all games)");
  } else {
    for (const [id, count] of Object.entries(synergyCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${id}: ${count}/${NUM_RUNS}`);
    }
  }

  // Final meter spread for victories
  const victories = results.filter((r) => r.outcome === "victory");
  if (victories.length > 0) {
    console.log("\nVictory Resources (avg):");
    const avgMeters = {denarii: 0, food: 0, population: 0, garrison: 0, morale: 0, faith: 0, piety: 0};
    const keys = ['denarii', 'food', 'population', 'garrison', 'morale', 'faith', 'piety'] as const;
    for (const v of victories) {
      for (const m of keys) {
        avgMeters[m] += v.finalResources[m];
      }
    }
    for (const m of keys) {
      avgMeters[m] = Math.round(avgMeters[m] / victories.length);
    }
    console.log(avgMeters);
  }

  // Final verdict
  console.log("\n" + "=".repeat(80));
  console.log(`Total: ${results.length} games | ${totalBugs} bugs | ${totalWarnings} warnings`);
  if (totalBugs === 0) {
    console.log("No invariant violations detected.");
  } else {
    console.log(`ATTENTION: ${totalBugs} bug(s) found — review [BUG] lines above.`);
  }
  console.log("=".repeat(80) + "\n");
  if (totalBugs > 0 || results.some(result => result.outcome !== 'victory' && result.outcome !== 'game_over')) process.exitCode = 1;
  return results;

}
const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) main();
