import {reduceFlipAction} from './flipActions.ts';
import {simulateSeason} from './simulateSeason.ts';
import {MAX_TURNS, turnToSeasonYear} from './gameCalendar.ts';
import type {HallLogEntry, HallSaveState} from './hallAudienceState.ts';
import type {GameSnapshot} from '../save/saveGame.ts';
import type {GameCommand} from './gameCommands.ts';
import type {EventDefinition} from '../data/eventTypes.ts';
import type {BuildingId, BuildingDefinition} from '../data/buildings.ts';
import type {RandomSource} from './eventSelector.ts';
import { settlePendingEvent } from './eventChoice.ts';
import { createInitialState } from './initialGameState.ts';
export { createInitialState } from './initialGameState.ts';
import {getChandelierPrestigeBonus} from "./forgeTools.ts";
import {addChronicle} from './chronicle.ts';
import { planForgeAncillary, planForgeTalk } from './forgeAncillaryActions.ts';
import { planForgeVisit } from './forgeVisits.ts';
import { planForgeItemAction } from './forgeItemActions.ts';
import { planForgeCompletion } from './forgeCompletion.ts';
import { planHallEventDismissal } from './hallConsequences.ts';
import { planCouncilVote, planDecreeIssue, planDecreeRevocation } from './hallCivic.ts';
import { planDisputeRuling } from './disputeActions.ts';
/**
 * gameReducer.ts
 *
 * useReducer-compatible reducer for The Lord's Ledger.
 *
 * Resource-based architecture: no abstract meters (treasury/people/military/faith).
 * All game state is expressed through concrete resources:
 *   denarii, food, population, garrison, inventory, buildings, castle, etc.
 *
 * State is plain-serializable JS — no class instances, no functions, no closures.
 * All transitions are pure: random draws advance the saved rngState.
 */

import {
  checkGameOver,
} from "./meterUtils.ts";

import {
  selectRandomEvent,
} from "./eventSelector.ts";
import { createRandomCursor, DEFAULT_SEED, seedLegacySnapshot } from "./random.ts";
import { createScanPlan, summarizeScan } from "./watchtowerScan.ts";
import { isGambitWager, resolveGambitRound } from "./tavernGambit.ts";
import { addTavernLedgerInteger } from "./tavernLedger.ts";
import { planRatRun, scoreRatRun } from "./ratsInCellar.ts";
import { rollStrangerEncounter, strangerTradeTerms } from "./tavernEncounter.ts";
import { isBardContent, isBardSolvedIds, nextBardContent } from "./tavernBard.ts";
import {reduceCompanionAction} from "./tavernCompanionActions.ts";
import { resolveFeast } from "./feast.ts";
import {FOREIGN_TRADERS} from '../data/market.ts';
import {reduceMarketAction} from './marketActions.ts';

import { canBuildBuilding, getTotalFood, getBuildingType, getRepairCost } from "./economyEngine.ts";
import { isBuildingIndex, nextBuildingInstanceId, getUpgradeEligibility } from "./buildingActions.ts";
import { getMilitaryReadiness } from './militaryReadiness.ts';
import { planMilitaryAction } from './militaryActions.ts';
import { isPositivePrice } from "./transactionValidation.ts";
import { planChapelAction } from "./chapelActions.ts";
import { planPeopleAction } from "./peopleActions.ts";
import { planAudienceResponse, type AudienceReceipts } from "./audienceActions.ts";
import {getConstructionCost} from './forgeTools.ts';
import BUILDINGS from "../data/buildings.ts";
import {
  EMPTY_INVENTORY, generateMarketPrices, DIFFICULTY_CONFIGS,
} from "../data/economy.ts";
import { checkFlipTriggers, getInitialFlipStats } from "./flipEngine.ts";
import { activateSynergies, advanceSynergyCounters, applySynergyMeterEffects } from "./synergyEngine.ts";
import { resolveRaid, buildRaidChronicleText } from "./raidEngine.ts";
import { RAID_TYPES } from "../data/raids.ts";
import {
  CRIMINAL_DEFENSE_THRESHOLD, SCOTTISH_DEFENSE_THRESHOLD,
  getTotalGarrison,
  removeFromGarrison,
  getInitialMilitaryState, MILITARY_SCRIBES_NOTES,
} from "../data/military.ts";
import { BARD_RIDDLES, BARD_STATE_COMMENTS, GAMBIT_MAX_ROUNDS } from "../data/tavern.ts";
import { computeReputation, computeCompoundFlags, CRISIS_EVENTS, PEAK_EVENTS } from "../data/greatHall.ts";
import { getInitialPeopleState } from "../data/people.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HALL_METERS = ['people', 'treasury', 'church', 'military'] as const;
const buildingDefinitions: Readonly<Record<BuildingId, BuildingDefinition>> = BUILDINGS;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------



// Title prices are deterministic; each started game gets a separately seeded state.
export const initialState = createInitialState();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------







function pickRandomEvent(usedRandomIds: string[], turn: number, allRandomEvents: readonly EventDefinition[], random: RandomSource) {
  const event = selectRandomEvent(usedRandomIds, turn, allRandomEvents, random);
  if (!event) return { event: null, usedRandomIds };

  const allUsed = (allRandomEvents || []).every((e) => usedRandomIds.includes(e.id));
  const nextUsed = allUsed
    ? [event.id]
    : [...usedRandomIds.filter((id) => id !== event.id), event.id];

  return { event, usedRandomIds: nextUsed };
}







/**
 * Returns which tabs are unlocked for a given turn.
 * All tabs unlocked from turn 1 in resource-based mode.
 */
export function getUnlockedTabs() {
  return ["estate", "map", "market", "military", "people", "chronicle"];
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reduceGame(state: GameSnapshot, action: GameCommand, random: RandomSource): GameSnapshot {
  switch (action.type) {

    // -----------------------------------------------------------------------
    // START / RESTART
    // -----------------------------------------------------------------------
    case "START_GAME":
    case "PLAY_AGAIN": {
      const difficulty = action.payload?.difficulty ?? state.difficulty ?? "normal";
      if (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") return state;
      const config = DIFFICULTY_CONFIGS[difficulty];
      const startInventory = { ...EMPTY_INVENTORY, ...config.startingInventory };

      const openingText =
        "The old lord has passed. You have inherited the estate. " +
        "The spring air carries both promise and uncertainty. " +
        "Build your manor, manage your resources, then simulate the season to see what unfolds.";

      const fresh = createInitialState(action.payload?.seed ?? DEFAULT_SEED);
      const chronicle = addChronicle([], openingText, fresh.season, fresh.year, fresh.turn, "system");

      return {
        ...fresh,
        phase: "management",
        difficulty,
        chronicle,
        denarii: config.startingDenarii,
        food: getTotalFood(startInventory),
        population: config.startingPopulation,
        garrison: config.startingGarrison ?? 5,
        inventory: startInventory,
        buildings: [
          { instanceId: "coal_pit-0-pre", type: "coal_pit", condition: 100, builtOnTurn: 0, freeUpkeep: true },
          { instanceId: "tannery-0-pre", type: "tannery", condition: 100, builtOnTurn: 0, freeUpkeep: true },
          { instanceId: "sawmill-0-pre", type: "sawmill", condition: 100, builtOnTurn: 0, freeUpkeep: true },
          { instanceId: "smelter-0-pre", type: "smelter", condition: 100, builtOnTurn: 0, freeUpkeep: true },
        ],
        military: getInitialMilitaryState(config.startingGarrison ?? 5),
        people: getInitialPeopleState(config.startingPopulation),
      };
    }

    // -----------------------------------------------------------------------
    // SET_TAB
    // -----------------------------------------------------------------------
    case "SET_TAB": {
      const { tab } = action.payload ?? {};
      if (!tab) return state;
      return { ...state, activeTab: tab };
    }

    case "DISMISS_TUTORIAL": {
      const { tab } = action.payload ?? {};
      if (!tab || state.tutorialsSeen.includes(tab)) return state;
      return { ...state, tutorialsSeen: [...state.tutorialsSeen, tab] };
    }

    // -----------------------------------------------------------------------
    // BUILD_BUILDING
    // -----------------------------------------------------------------------
    case "BUILD_BUILDING": {
      const { buildingId } = action.payload ?? {};
      if (state.phase !== "management") return state;

      const def = BUILDINGS[buildingId];
      if (!def) return state;

      const check = canBuildBuilding(buildingId, state);
      if (!check.canBuild) return state;

      const constructionCost = getConstructionCost(def.cost, state.blacksmith);
      const buildingInstance = {
        instanceId: nextBuildingInstanceId(buildingId, state.turn, state.chronicle.length, state.buildings),
        type: buildingId,
        condition: 100,
        builtOnTurn: state.turn,
      };

      return {
        ...state,
        denarii: state.denarii - constructionCost,
        buildings: [...state.buildings, buildingInstance],
        chronicle: addChronicle(state.chronicle, `Built a ${def.name} for ${constructionCost}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // DEMOLISH_BUILDING
    // -----------------------------------------------------------------------
    case "DEMOLISH_BUILDING": {
      const { buildingIndex } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (!isBuildingIndex(buildingIndex, state.buildings.length)) return state;

      const newBuildings = [...state.buildings];
      newBuildings.splice(buildingIndex, 1);

      const removed = state.buildings[buildingIndex];
      if (removed === undefined) return state;
      const removedType = getBuildingType(removed);
      const def = buildingDefinitions[removedType];
      const refund = def ? Math.floor(def.cost / 2) : 0;

      return {
        ...state,
        buildings: newBuildings,
        denarii: state.denarii + refund,
        chronicle: addChronicle(state.chronicle, `Demolished a ${def?.name || "building"}. Refunded ${refund}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // REPAIR_BUILDING
    // -----------------------------------------------------------------------
    case "REPAIR_BUILDING": {
      const { buildingIndex } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (!isBuildingIndex(buildingIndex, state.buildings.length)) return state;

      const building = state.buildings[buildingIndex];
      if (building === undefined || typeof building === "string") return state; // Can't repair legacy format
      if (building.condition >= 100) return state;

      const cost = getRepairCost(building);
      if (state.denarii < cost) return state;

      const repairedBuildings = state.buildings.map((b, i) =>
        i === buildingIndex && typeof b !== 'string' ? { ...b, condition: 100 } : b
      );
      const def = buildingDefinitions[getBuildingType(building)];

      return {
        ...state,
        denarii: state.denarii - cost,
        buildings: repairedBuildings,
        chronicle: addChronicle(state.chronicle, `Repaired ${def?.name || "building"} to full condition for ${cost}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // UPGRADE_BUILDING
    // -----------------------------------------------------------------------
    case "UPGRADE_BUILDING": {
      const { buildingIndex } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (!isBuildingIndex(buildingIndex, state.buildings.length)) return state;

      const building = state.buildings[buildingIndex];
      if (building === undefined) return state;
      const typeId = getBuildingType(building);
      const def = buildingDefinitions[typeId];
      if (!def?.upgradeTo) return state;

      const upgradeDef = buildingDefinitions[def.upgradeTo];
      if (!upgradeDef) return state;
      const eligibility = getUpgradeEligibility(state, buildingIndex);
      if (!eligibility.allowed) return state;
      const upgradeCost = eligibility.cost;
      const targetType = def.upgradeTo;
      const instanceId = nextBuildingInstanceId(targetType, state.turn, state.chronicle.length, state.buildings);

      const upgradedBuildings = state.buildings.map((b, i) =>
        i === buildingIndex
          ? (typeof b === "string"
            ? { type: targetType, instanceId, condition: 100, builtOnTurn: state.turn }
            : { ...b, type: targetType, instanceId })
          : b
      );

      return {
        ...state,
        denarii: state.denarii - upgradeCost,
        buildings: upgradedBuildings,
        chronicle: addChronicle(state.chronicle, `Upgraded ${def.name} to ${upgradeDef.name} for ${upgradeCost}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // Posted and negotiated transactions share one pure Market owner.
    case "SELL_RESOURCE":
    case "BUY_RESOURCE":
    case "HAGGLE_START":
    case "HAGGLE_COUNTER":
    case "HAGGLE_ACCEPT":
    case "HAGGLE_WALK_AWAY":
      return reduceMarketAction(state, action, random);

    // -----------------------------------------------------------------------
    // SET_TAX_RATE
    // -----------------------------------------------------------------------
    case "SET_TAX_RATE":
    case "PEOPLE_SET_LABOR": {
      const patch = planPeopleAction(state, action.type, 'payload' in action ? action.payload : undefined);
      return patch ? { ...state, ...patch } : state;
    }

    // Military commands share an atomic, checked domain planner.
    case "RECRUIT_SOLDIERS":
    case "DISMISS_SOLDIERS":
    case "UPGRADE_FORTIFICATION": {
      const change = planMilitaryAction(state, action.type, 'payload' in action ? action.payload : undefined);
      if (!change) return state;
      return {
        ...state,
        ...change.patch,
        chronicle: addChronicle(state.chronicle, change.chronicleText, state.season, state.year, state.turn, "action"),
      };
    }
    // Retained legacy commands remain no-ops.
    case "UPGRADE_CASTLE":
    case "INSTALL_DEFENSE":
      return state;

    // -----------------------------------------------------------------------
    // DONATE_TO_CHURCH
    // -----------------------------------------------------------------------
    case "DONATE_TO_CHURCH": {
      const { amount } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (!isPositivePrice(amount) || !Number.isFinite(state.denarii) || state.denarii < amount) return state;
      const churchDonation = (state.churchDonation || 0) + amount;
      if (!Number.isFinite(churchDonation)) return state;

      return {
        ...state,
        denarii: state.denarii - amount,
        churchDonation,
        chronicle: addChronicle(state.chronicle, `Donated ${amount}d to the Church.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // SIMULATE_SEASON
    // -----------------------------------------------------------------------
    case "SIMULATE_SEASON": {
      return simulateSeason(state, action, random);
    }

    // -----------------------------------------------------------------------
    // RAID_DEFEND — player clicks "Defend the Estate" on warning screen
    // -----------------------------------------------------------------------
    case "RAID_DEFEND": {
      if (state.phase !== "raid_warning") return state;
      const raids = state.raids ?? {};
      const activeRaid = raids.activeRaid;
      if (!activeRaid || activeRaid.phase !== "warning") return state;

      const raidType = activeRaid.type;
      const mil = state.military ?? getInitialMilitaryState(state.garrison);

      const readiness = getMilitaryReadiness({ ...state, military: mil }, activeRaid.drillBonus);
      const { drillBonus } = readiness;
      const watchtowerBonus = raidType === "criminal" ? readiness.criminalScoutBonus : readiness.scottishScoutBonus;
      const defenseRating = raidType === "criminal" ? readiness.criminalDefense : readiness.scottishDefense;
      const defenseThreshold = raidType === "criminal" ? CRIMINAL_DEFENSE_THRESHOLD : SCOTTISH_DEFENSE_THRESHOLD;

      const result = resolveRaid(raidType, defenseRating, defenseThreshold, state.garrison, state.castleLevel, state.inventory, state.difficulty, random, state.blacksmith);
      if (!result) return state;

      // Log watchtower intelligence if it helped
      let raidChronicle = state.chronicle;
      if (watchtowerBonus > 0) {
        raidChronicle = addChronicle(
          raidChronicle,
          `Watchtower intelligence applied: defense rating boosted by ${watchtowerBonus}.`,
          state.season, state.year, state.turn, "system"
        );
      }
      if (drillBonus > 0) {
        raidChronicle = addChronicle(raidChronicle,
          `Aldric's drill added ${drillBonus} defense from the trained garrison.`,
          state.season, state.year, state.turn, "system");
      }

      // Update morale based on raid outcome
      let raidMorale = mil.morale;
      if (result.victory) {
        raidMorale = Math.min(100, raidMorale + 15);
      } else {
        raidMorale = Math.max(0, raidMorale - 20);
      }

      // Determine scribe's note for first-time raids
      const raidDef = RAID_TYPES[raidType];
      const scribesKey = raidType === "criminal" ? "criminalScribesNoteSeen" : "scottishScribesNoteSeen";
      const isFirstRaid = !raids[scribesKey];
      const raidScribesNote = isFirstRaid ? raidDef.scribesNote : null;

      // Also show feudal obligation scribe's note on first raid if not yet seen
      let militaryScribesNote = null;
      if (!mil.scribesNoteSeen?.feudalObligation) {
        militaryScribesNote = MILITARY_SCRIBES_NOTES.feudalObligation;
      }

      return {
        ...state,
        phase: "raid_result",
        scribesNote: raidScribesNote || militaryScribesNote || null,
        chronicle: raidChronicle,
        military: {
          ...mil,
          morale: raidMorale,
          lastRaidOutcome: result.victory ? "victory" : "defeat",
          idleSeasons: 0,
          scribesNoteSeen: militaryScribesNote
            ? { ...mil.scribesNoteSeen, feudalObligation: true }
            : mil.scribesNoteSeen,
        },
        raids: {
          ...raids,
          activeRaid: { ...activeRaid, phase: "result", result, defenseRating, defenseThreshold, watchtowerBonus, drillBonus },
          [scribesKey]: true,
        },
      };
    }

    // -----------------------------------------------------------------------
    // RAID_CONTINUE — player clicks "Continue" after seeing raid results
    // -----------------------------------------------------------------------
    case "RAID_CONTINUE": {
      if (state.phase !== "raid_result") return state;
      const raids = state.raids ?? {};
      const activeRaid = raids.activeRaid;
      if (!activeRaid || activeRaid.phase !== "result" || !activeRaid.result) return state;

      const { type: raidType, result } = activeRaid;
      const { season, year, turn } = state;

      // Apply resource changes — cap population loss at 25% per raid
      const newDenarii = Math.max(0, state.denarii + result.denariiDelta);
      const maxPopLoss = Math.ceil(state.population * 0.25);
      const cappedPopDelta = result.populationDelta < 0
        ? Math.max(result.populationDelta, -maxPopLoss)
        : result.populationDelta;
      const newPopulation = Math.max(0, state.population + cappedPopDelta);
      const newInventory = { ...state.inventory };

      // Apply food delta to grain
      if (result.foodDelta !== 0) {
        const currentGrain = newInventory.grain || 0;
        newInventory.grain = Math.max(0, currentGrain + result.foodDelta);
      }

      // Apply trade good loss
      if (result.tradeGoodLost) {
        const { resource, amount } = result.tradeGoodLost;
        newInventory[resource] = Math.max(0, (newInventory[resource] || 0) - amount);
      }

      const newFood = getTotalFood(newInventory);

      // Reconcile typed garrison after raid losses
      const raidMil = state.military ?? getInitialMilitaryState(state.garrison);
      let raidGarrison = { ...raidMil.garrison };
      let raidSoldiersLost = 0;
      if (result.garrisonDelta < 0) {
        const loss = Math.abs(result.garrisonDelta);
        raidGarrison = removeFromGarrison(raidGarrison, loss);
        raidSoldiersLost = loss;
      }
      // Add garrison gains (from victory — added as levy)
      if (result.garrisonDelta > 0) {
        raidGarrison = { ...raidGarrison, levy: (raidGarrison.levy || 0) + result.garrisonDelta };
      }
      let newGarrison = getTotalGarrison(raidGarrison);
      newGarrison = Math.max(0, newGarrison);

      const updatedRaidMil = {
        ...raidMil,
        garrison: raidGarrison,
        soldiersLostToRaids: (raidMil.soldiersLostToRaids || 0) + raidSoldiersLost,
      };

      // Build chronicle entry
      const defRating = activeRaid.defenseRating ?? 0;
      const defThreshold = activeRaid.defenseThreshold ?? 0;
      const wtBonus = activeRaid.watchtowerBonus ?? 0;
      const chronicleText = buildRaidChronicleText(raidType, result, season, year, state.garrison, defRating, defThreshold, wtBonus);
      const nextChronicle = addChronicle(state.chronicle, chronicleText, season, year, turn, "event");

      // Update raid statistics
      const isCriminal = raidType === "criminal";
      const updatedRaids = {
        ...raids,
        lastRaidTurn: turn,
        lastRaidType: raidType,
        criminalCooldown: isCriminal ? RAID_TYPES.criminal.cooldownTurns : raids.criminalCooldown,
        scottishCooldown: !isCriminal ? RAID_TYPES.scottish.cooldownTurns : raids.scottishCooldown,
        totalCriminalRaids: (raids.totalCriminalRaids || 0) + (isCriminal ? 1 : 0),
        totalScottishRaids: (raids.totalScottishRaids || 0) + (!isCriminal ? 1 : 0),
        criminalVictories: (raids.criminalVictories || 0) + (isCriminal && result.victory ? 1 : 0),
        scottishVictories: (raids.scottishVictories || 0) + (!isCriminal && result.victory ? 1 : 0),
        criminalDefeats: (raids.criminalDefeats || 0) + (isCriminal && !result.victory ? 1 : 0),
        scottishDefeats: (raids.scottishDefeats || 0) + (!isCriminal && !result.victory ? 1 : 0),
        totalDenariiLost: (raids.totalDenariiLost || 0) + (result.denariiDelta < 0 ? Math.abs(result.denariiDelta) : 0),
        totalFoodLost: (raids.totalFoodLost || 0) + (result.foodDelta < 0 ? Math.abs(result.foodDelta) : 0),
        totalDenariiRecovered: (raids.totalDenariiRecovered || 0) + (result.denariiDelta > 0 ? result.denariiDelta : 0),
        activeRaid: null,
      };

      // Bankruptcy counter: preserve SIMULATE_SEASON's count for this turn.
      // Only update if raid pushed denarii to 0 when it wasn't already 0.
      let raidBankruptcyTurns = state.bankruptcyTurns || 0;
      if (newDenarii <= 0 && state.denarii > 0) {
        // Raid caused bankruptcy this turn — set to 1 (not increment, to avoid double-count)
        raidBankruptcyTurns = Math.max(raidBankruptcyTurns, 1);
      }

      // Check game over after raid losses
      const postRaidState = { population: newPopulation, bankruptcyTurns: state.bankruptcyTurns, starvationTurns: state.starvationTurns, difficulty: state.difficulty };
      const raidGameOver = checkGameOver(postRaidState);
      if (raidGameOver) {
        return {
          ...state,
          denarii: newDenarii,
          food: newFood,
          population: newPopulation,
          garrison: newGarrison,
          inventory: newInventory,
          chronicle: nextChronicle,
          raids: updatedRaids,
          military: updatedRaidMil,
          bankruptcyTurns: raidBankruptcyTurns,
          phase: "game_over",
          gameOverReason: raidGameOver,
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
        };
      }

      // Resume normal season flow — go to seasonal_action (or skip to resolve if no event)
      return {
        ...state,
        denarii: newDenarii,
        food: newFood,
        population: newPopulation,
        garrison: newGarrison,
        inventory: newInventory,
        chronicle: nextChronicle,
        raids: updatedRaids,
        military: updatedRaidMil,
        bankruptcyTurns: raidBankruptcyTurns,
        scribesNote: null,
        phase: (state.currentEvent && state.currentEvent.options?.length > 0) ? "seasonal_action" : "seasonal_resolve",
        currentEvent: (state.currentEvent && state.currentEvent.options?.length > 0) ? state.currentEvent : null,
        activeTab: "chronicle",
        resourceDeltas: {
          denarii: newDenarii - state.denarii,
          food: newFood - state.food,
          population: newPopulation - state.population,
          garrison: newGarrison - state.garrison,
        },
      };
    }

    // -----------------------------------------------------------------------
    // SELECT_SEASONAL_ACTION
    // -----------------------------------------------------------------------
    case "SELECT_SEASONAL_ACTION": {
      return settlePendingEvent(state, "seasonal", action.payload?.optionIndex);
    }

    // -----------------------------------------------------------------------
    // CONTINUE_TO_RANDOM
    // -----------------------------------------------------------------------
    case "CONTINUE_TO_RANDOM": {
      const { phase, usedRandomIds, turn } = state;
      const { randomEvents = [] } = action.payload ?? {};

      if (phase !== "seasonal_resolve") return state;

      const { event: randomEvent, usedRandomIds: nextUsedRandomIds } = pickRandomEvent(
        usedRandomIds,
        turn,
        randomEvents,
        random,
      );

      if (!randomEvent) {
        return {
          ...state,
          phase: "random_resolve",
          currentRandomEvent: null,
          usedRandomIds: nextUsedRandomIds,
        };
      }

      return {
        ...state,
        phase: "random_event",
        currentRandomEvent: randomEvent,
        usedRandomIds: nextUsedRandomIds,
      };
    }

    // -----------------------------------------------------------------------
    // SELECT_RANDOM_RESPONSE
    // -----------------------------------------------------------------------
    case "SELECT_RANDOM_RESPONSE": {
      return settlePendingEvent(state, "random", action.payload?.optionIndex);
    }

    // -----------------------------------------------------------------------
    // ADVANCE_TURN
    // -----------------------------------------------------------------------
    case "ADVANCE_TURN": {
      const { phase, turn, chronicle } = state;

      if (phase !== "random_resolve") return state;

      // Victory check
      if (turn >= MAX_TURNS) {
        const isPyrrhic = state.population < 3;
        const victoryText = isPyrrhic
          ? "Ten years have passed, but at what cost? Your estate barely clings to life. " +
            "The chronicles will note your survival, though few remain to read them."
          : "Ten years have passed. Your reign has endured through war, famine, and feast. " +
            "The chronicles will remember your name.";
        const { season, year } = turnToSeasonYear(turn);
        return {
          ...state,
          phase: "victory",
          pyrrhicVictory: isPyrrhic,
          chronicle: addChronicle(chronicle, victoryText, season, year, turn, "system"),
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
        };
      }

      const nextTurn = turn + 1;
      const { season: nextSeason, year: nextYear } = turnToSeasonYear(nextTurn);

      let nextChronicle = chronicle;

      // Generate new market prices for the new season
      const newMarketPrices = generateMarketPrices(random);

      // Update market: rotate foreign trader, reset haggle, clear event
      const advMkt = state.market ?? {};
      const foreignTrader = FOREIGN_TRADERS[nextSeason];
      const advanceMarket = {
        ...advMkt,
        currentForeignTrader: nextSeason,
        ...(Object.hasOwn(advMkt,"supply")?{supply:{turn:nextTurn,purchased:{}}}:{}),
        activeHaggle: null,
        activeMarketEvent: null,
        tradesThisSeason: 0,
      };
      if (foreignTrader && advMkt.currentForeignTrader !== nextSeason) {
        nextChronicle = addChronicle(nextChronicle, foreignTrader.arrivalText, nextSeason, nextYear, nextTurn, "event");
      }

      const zeroDeltas = { denarii: 0, food: 0, population: 0, garrison: 0 };

      // Reset seasonal Great Hall limits (decree slots + feast flag)
      // Phase 4: Small trust decay if lord didn't interact with the hall at all
      const prevHallAdvance = state.greatHall ?? {};
      const hallWasActive = prevHallAdvance.hasFeastedThisSeason
        || (prevHallAdvance.decreeSlotsUsed ?? 0) > 0
        || (prevHallAdvance.disputesResolved || 0) > 0;
      const trustDecay = hallWasActive ? 0 : -2;
      const advanceTrust = Math.max(0, Math.min(100, (prevHallAdvance.stewardTrust ?? 50) + trustDecay));

      // Phase 4: Recompute reputation from full ruling history each season
      const advanceRep = computeReputation(prevHallAdvance.rulingHistory || [],getChandelierPrestigeBonus(state.blacksmith));

      // Phase 5: Snapshot meter history for trend tracking
      const prevMeterHistory = prevHallAdvance.meterHistory || [];
      const meterSnapshot = {
        turn: state.turn,
        season: state.season,
        year: state.year,
        meters: { ...(prevHallAdvance.meters || { people: 50, treasury: 50, church: 50, military: 50 }) },
      };

      // Phase 5: Recompute compound flags
      const advanceCompoundFlags = computeCompoundFlags(prevHallAdvance.rulingHistory || [], prevHallAdvance);

      // Phase 5: Check for crisis/peak events at season boundary
      const advMeters = prevHallAdvance.meters || { people: 50, treasury: 50, church: 50, military: 50 };
      const advCrisis = { ...(prevHallAdvance.crisisTriggered || {}) };
      const advPeak = { ...(prevHallAdvance.peakTriggered || {}) };
      let seasonHallEvent: HallSaveState['pendingHallEvent'] = null;
      for (const [key, val] of Object.entries(advMeters)) {
        const meter = HALL_METERS.find(id => id === key);
        if (meter && val < 20 && !advCrisis[meter] && CRISIS_EVENTS[meter]) {
          seasonHallEvent = { ...CRISIS_EVENTS[meter], meter, type: "crisis" };
          advCrisis[meter] = true;
        }
        if (meter && val > 80 && !advPeak[meter] && PEAK_EVENTS[meter]) {
          seasonHallEvent = { ...PEAK_EVENTS[meter], meter, type: "peak" };
          advPeak[meter] = true;
        }
        if (val >= 20) Object.assign(advCrisis, {[key]: false});
        if (val <= 80) Object.assign(advPeak, {[key]: false});
      }

      const advanceHall = {
        ...prevHallAdvance,
        decreeSlotsUsed: 0,
        hasFeastedThisSeason: false,
        stewardTrust: advanceTrust,
        reputation: advanceRep.title,
        reputationTrack: advanceRep.track,
        reputationScores: advanceRep.scores,
        meterHistory: [...prevMeterHistory, meterSnapshot],
        compoundFlags: advanceCompoundFlags,
        pendingHallEvent: seasonHallEvent || prevHallAdvance.pendingHallEvent || null,
        crisisTriggered: advCrisis,
        peakTriggered: advPeak,
      };

      // --- Synergy consecutive counters ---
      const updatedSynergies = advanceSynergyCounters(state.synergies ?? {}, {
        taxRate: state.taxRate,
        food: state.food ?? 0,
        faith: state.chapel?.faith ?? 0,
        peopleApproval: state.greatHall?.meters?.people ?? 0,
      });

      // B-14 FIX: reset per-year spice counter when the year rolls over.
      const prevChapelAdvance = state.chapel ?? {};
      const advanceChapel = nextYear !== state.year
        ? { ...prevChapelAdvance, spicePurchasesThisYear: 0 }
        : prevChapelAdvance;

      // Check for newly activated synergies
      const stateForSynergyCheck = { ...state, synergies: updatedSynergies };
      const {synergies: synergiesAfterCheck, chronicle: synChronicle, notifications: synNotifications} =
        activateSynergies(stateForSynergyCheck, updatedSynergies, nextChronicle, nextSeason, nextYear, nextTurn);

      const advanceBonuses = applySynergyMeterEffects(
        advanceHall.meters, advanceChapel.faith ?? 50, synergiesAfterCheck.activated ?? [],
      );
      const rewardedHall = { ...advanceHall, meters: advanceBonuses.meters };
      const rewardedChapel = { ...advanceChapel, faith: advanceBonuses.faith };

      // Check if a perspective flip should trigger this turn
      const triggeredFlipId = checkFlipTriggers({
        ...state,
        turn: nextTurn,
      });

      if (triggeredFlipId) {
        return {
          ...state,
          phase: "flip_intro",
          turn: nextTurn,
          season: nextSeason,
          year: nextYear,
          chronicle: synChronicle,
          marketPrices: newMarketPrices,
          resourceDeltas: zeroDeltas,
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
          seasonReport: [],
          synergies: synergiesAfterCheck,
          pendingSynergyNotifications: [],
          deferredSynergyNotifications: synNotifications,
          market: advanceMarket,
          greatHall: rewardedHall,
          chapel: rewardedChapel,
          // Flip state
          lastFlipTurn: nextTurn,
          currentFlipId: triggeredFlipId,
          currentFlipStats: getInitialFlipStats(triggeredFlipId),
          currentDecisionIndex: 0,
          flipConsequenceFlags: [],
          currentFlipOutcome: null,
        };
      }

      return {
        ...state,
        phase: "management",
        turn: nextTurn,
        season: nextSeason,
        year: nextYear,
        currentEvent: null,
        currentRandomEvent: null,
        scribesNote: null,
        chronicle: synChronicle,
        resourceDeltas: zeroDeltas,
        marketPrices: newMarketPrices,
        activeTab: "estate",
        seasonReport: [],
        synergies: synergiesAfterCheck,
        pendingSynergyNotifications: synNotifications,
        market: advanceMarket,
        greatHall: rewardedHall,
        chapel: rewardedChapel,
      };
    }

    // -----------------------------------------------------------------------
    // DISMISS_SCRIBES_NOTE
    // -----------------------------------------------------------------------
    case "DISMISS_SCRIBES_NOTE": {
      return { ...state, scribesNote: null };
    }

    case "SET_SCRIBES_NOTE": {
      return { ...state, scribesNote: action.payload.text };
    }

    // -----------------------------------------------------------------------
    // Perspective Flip actions
    // -----------------------------------------------------------------------
    case "DISMISS_FLIP_INTRO":
    case "SELECT_FLIP_OPTION":
    case "CONTINUE_FLIP":
    case "DISMISS_FLIP_SUMMARY":
      return reduceFlipAction(state, action, random);

    // -----------------------------------------------------------------------
    // Dismiss synergy notification
    // -----------------------------------------------------------------------
    case "DISMISS_SYNERGY_NOTIFICATION": {
      const queue = state.pendingSynergyNotifications ?? [];
      return {
        ...state,
        pendingSynergyNotifications: queue.slice(1),
      };
    }

    // -----------------------------------------------------------------------
    // TAVERN ACTIONS
    // -----------------------------------------------------------------------

    case "TAVERN_VISIT": {
      if (state.phase !== "management") return state;
      const prevTavern = state.tavern ?? {};
      const totalVisits = addTavernLedgerInteger(prevTavern.totalVisits, 1, true);
      if (totalVisits === null) return state;
      const pendingStrangerEncounter = prevTavern.pendingStrangerEncounter ??
        (prevTavern.strangerAppearedThisSeason ? null : rollStrangerEncounter(random));
      return {
        ...state,
        tavern: {
          ...prevTavern,
          totalVisits,
          pendingStrangerEncounter,
        },
        chronicle: addChronicle(state.chronicle, "You visited the Boar\u2019s Head Tavern.", state.season, state.year, state.turn, "action"),
      };
    }

    case "TAVERN_GAMBIT_PLAY": {
      if (state.phase !== "management") return state;
      const { choice, wager, seed } = action.payload ?? {};
      const prevT = state.tavern ?? {};
      const rounds = prevT.gambitRoundsThisSeason ?? 0;
      if (seed !== state.rngState || !isGambitWager(wager) || state.denarii < wager ||
          !Number.isSafeInteger(rounds) || rounds < 0 || rounds >= GAMBIT_MAX_ROUNDS) return state;
      const round = resolveGambitRound(prevT.gambitLastChoice ?? null, choice, random);
      if (!round) return state;
      const result = round.outcome;
      const net = result === "win" ? wager : result === "lose" ? -wager : 0;
      const gambitTotalWins = addTavernLedgerInteger(prevT.gambitTotalWins, result === "win" ? 1 : 0, true);
      const gambitTotalLosses = addTavernLedgerInteger(prevT.gambitTotalLosses, result === "lose" ? 1 : 0, true);
      const gambitNetEarnings = addTavernLedgerInteger(prevT.gambitNetEarnings, net);
      if (gambitTotalWins === null || gambitTotalLosses === null || gambitNetEarnings === null) return state;
      const newDenarii = state.denarii + net;

      const label = result === "win" ? "won" : result === "lose" ? "lost" : "drew at";
      const absNet = Math.abs(net);

      return {
        ...state,
        denarii: newDenarii,
        tavern: {
          ...prevT,
          gambitRoundsThisSeason: rounds + 1,
          gambitLastChoice: round.player,
          gambitTotalWins,
          gambitTotalLosses,
          gambitNetEarnings,
        },
        chronicle: addChronicle(
          state.chronicle,
          result === "draw"
            ? `You ${label} Knight\u2019s Gambit. No coins changed hands.`
            : `You ${label} ${absNet}d at Knight\u2019s Gambit.`,
          state.season, state.year, state.turn, "action",
        ),
      };
    }

    case "TAVERN_GAMBIT_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        tavern: { ...state.tavern, gambitScribesNoteSeen: true },
      };
    }

    case "TAVERN_RATS_FINISH": {
      if (state.phase !== "management") return state;
      const { caught, escaped, seed } = action.payload ?? {};
      const prevTav = state.tavern ?? {};
      if (prevTav.ratsPlayedThisSeason || seed !== state.rngState) return state;
      const plan = planRatRun(random);
      const score = scoreRatRun(caught, escaped, plan.length);
      if (!score) return state;
      const { foodLost, reward } = score;
      const newFood = Math.max(0, state.food - foodLost);
      const newDen = state.denarii + (reward ?? 0);

      // Apply food loss to inventory (remove from grain first, then livestock, then fish)
      let remainingLoss = foodLost;
      const newInv = { ...state.inventory };
      for (const key of ["grain", "livestock", "fish"] as const) {
        if (remainingLoss <= 0) break;
        const available = newInv[key] || 0;
        const take = Math.min(available, remainingLoss);
        newInv[key] = available - take;
        remainingLoss -= take;
      }

      return {
        ...state,
        denarii: newDen,
        food: newFood,
        inventory: newInv,
        tavern: {
          ...prevTav,
          ratsPlayedThisSeason: true,
          ratsBestScore: Math.max(prevTav.ratsBestScore ?? 0, caught),
        },
        chronicle: addChronicle(
          state.chronicle,
          `You cleared ${caught} rats from the cellar. ${foodLost > 0 ? `${foodLost} food was lost to vermin.` : "No food was lost!"}${reward > 0 ? ` Earned ${reward}d for your efforts.` : ""}`,
          state.season, state.year, state.turn, "action",
        ),
      };
    }

    case "TAVERN_RATS_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        tavern: { ...state.tavern, ratsScribesNoteSeen: true },
      };
    }

    case "TAVERN_BARD_NEXT": {
      if (state.phase !== "management") return state;
      const prevTvn = state.tavern ?? {};
      const commentIndex = BARD_STATE_COMMENTS.findIndex(comment => comment.condition(state));
      const next = nextBardContent(
        random, prevTvn.bardTalesRemaining ?? [], prevTvn.bardTalesServed ?? 0, commentIndex,
      );
      if (!next) return state;
      return {
        ...state,
        tavern: {
          ...prevTvn,
          bardCurrentContent: next.content,
          bardTalesRemaining: next.talesRemaining,
          bardTalesServed: next.talesServed,
        },
      };
    }

    case "TAVERN_BARD_ANSWER": {
      if (state.phase !== "management") return state;
      const prevTvn = state.tavern ?? {};
      const content = prevTvn.bardCurrentContent;
      const { option } = action.payload ?? {};
      if (!isBardContent(content) || content?.type !== "riddle" || content.answer !== null ||
          typeof option !== "string") return state;
      const riddle = BARD_RIDDLES.find(item => item.id === content.id);
      const solvedIds = prevTvn.bardSolvedRiddleIds ?? [];
      const oldCount = prevTvn.bardRiddlesSolved ?? 0;
      if (!riddle || !riddle.options.some(candidate => candidate === option) || !isBardSolvedIds(solvedIds) ||
          !Number.isSafeInteger(oldCount) || oldCount < 0 || oldCount >= Number.MAX_SAFE_INTEGER) return state;
      const awarded = option === riddle.answer && !solvedIds.includes(content.id);
      return {
        ...state,
        denarii: state.denarii + (awarded ? 10 : 0),
        tavern: {
          ...prevTvn,
          bardCurrentContent: { ...content, answer: option, awarded },
          bardSolvedRiddleIds: awarded ? [...solvedIds, content.id] : solvedIds,
          bardRiddlesSolved: oldCount + (awarded ? 1 : 0),
        },
        chronicle: awarded
          ? addChronicle(state.chronicle, "The bard\u2019s riddle earned you 10d.", state.season, state.year, state.turn, "action")
          : state.chronicle,
      };
    }

    case "TAVERN_WALL_STASH": {
      if (state.phase !== "management") return state;
      const prevTv = state.tavern ?? {};
      if (prevTv.wallStashFound) return state;
      return {
        ...state,
        denarii: state.denarii + 25,
        tavern: { ...prevTv, wallStashFound: true },
        chronicle: addChronicle(state.chronicle, "You found a hidden coin purse in the tavern wall! +25d.", state.season, state.year, state.turn, "action"),
      };
    }

    case "TAVERN_STRANGER_TRADE": {
      if (state.phase !== "management") return state;
      const prevTa = state.tavern ?? {};
      if (prevTa.strangerAppearedThisSeason || prevTa.pendingStrangerEncounter !== "trade") return state;
      const { cost, food } = strangerTradeTerms();
      if (state.denarii < cost) return state;

      const newInvStr = { ...state.inventory };
      newInvStr.grain = (newInvStr.grain || 0) + food;

      return {
        ...state,
        denarii: state.denarii - cost,
        inventory: newInvStr,
        food: getTotalFood(newInvStr),
        tavern: { ...prevTa, strangerAppearedThisSeason: true, pendingStrangerEncounter: null },
        chronicle: addChronicle(state.chronicle, "A mysterious stranger sold you provisions.", state.season, state.year, state.turn, "action"),
      };
    }

    case "TAVERN_STRANGER_DISMISS": {
      if (state.phase !== "management") return state;
      const prevTab = state.tavern ?? {};
      if (prevTab.strangerAppearedThisSeason || !prevTab.pendingStrangerEncounter) return state;
      return {
        ...state,
        tavern: { ...prevTab, strangerAppearedThisSeason: true, pendingStrangerEncounter: null },
        chronicle: addChronicle(
          state.chronicle,
          prevTab.pendingStrangerEncounter === "trade"
            ? "You declined the mysterious stranger's provisions."
            : "A mysterious stranger offered you counsel.",
          state.season, state.year, state.turn, "action",
        ),
      };
    }

    // -----------------------------------------------------------------------
    // Companion content, offer authority and settlement have one domain owner.
    case "TAVERN_MARTA_NEXT":
    case "TAVERN_MARTA_SCRIBES_NOTE_SEEN":
    case "TAVERN_MARTA_ACCEPT_OFFER":
    case "TAVERN_MARTA_DECLINE_OFFER":
    case "TAVERN_ALDRIC_NEXT":
    case "TAVERN_ALDRIC_SCRIBES_NOTE_SEEN":
    case "TAVERN_ALDRIC_ACCEPT_OFFER":
    case "TAVERN_ALDRIC_DECLINE_OFFER":
      return reduceCompanionAction(state, action, random);

    // -----------------------------------------------------------------------
    // CHAPEL ACTIONS
    // -----------------------------------------------------------------------

    case "CHAPEL_SET_VIEW":
    case "CHAPEL_PAY_TITHE":
    case "CHAPEL_BUY_ITEM":
    case "CHAPEL_START_DILEMMA":
    case "CHAPEL_RESOLVE_DILEMMA":
    case "CHAPEL_MS_START":
    case "CHAPEL_MS_FLASH":
    case "CHAPEL_MS_CLEAR_FLASH":
    case "CHAPEL_MS_DONE_SHOWING":
    case "CHAPEL_MS_INPUT": {
      const change = planChapelAction(state, action.type, 'payload' in action ? action.payload : undefined, random);
      if (!change) return state;
      const { chapel: patch, logText, chronicleText, chronicleKind, ...resources } = change;
      const chapel = { ...(state.chapel ?? {}), ...patch };
      if (logText) chapel.gameLog = [...(chapel.gameLog ?? []), {
        text: logText, turn: state.turn, season: state.season,
      }];
      return {
        ...state, ...resources, chapel,
        ...(chronicleText ? { chronicle: addChronicle(state.chronicle,
          chronicleText, state.season, state.year, state.turn, chronicleKind ?? "action") } : {}),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Dispute Resolution
    // -----------------------------------------------------------------------

    case "HALL_RULE_DISPUTE": {
      const plan = planDisputeRuling(state, action.payload);
      if (!plan) return state;
      const { disputeId, rulingId, consequences, decree, meters: newMeters } = plan;
      const prevHall = state.greatHall;

      const resolved = (prevHall.disputesResolved ?? 0) + 1;

      const rulingEntry = {
        disputeId,
        rulingId,
        consequences,
        decree,
        turn: state.turn,
        season: state.season,
        year: state.year,
      };

      // Phase 4: Compute reputation from cumulative ruling patterns
      const newHistory = [...(prevHall.rulingHistory ?? []), rulingEntry];
      const repResult = computeReputation(newHistory,getChandelierPrestigeBonus(state.blacksmith));

      // Phase 4: Trust shifts — small trust bump for each ruling (engagement reward)
      const trustDelta = 2;
      const newTrust = Math.max(0, Math.min(100, (prevHall.stewardTrust ?? 50) + trustDelta));

      // Phase 5: Compound flags and hall log
      const newCompoundFlags = computeCompoundFlags(newHistory, prevHall);
      const disputeLogEntry: HallLogEntry = {
        type: "dispute",
        text: `Ruled on dispute: "${decree}"`,
        turn: state.turn, season: state.season, year: state.year,
        consequences,
      };

      // Phase 5: Check for crisis/peak triggers after meter change
      let pendingEvent: HallSaveState['pendingHallEvent'] = null;
      const prevCrisis = prevHall.crisisTriggered || {};
      const prevPeak = prevHall.peakTriggered || {};
      const newCrisis = { ...prevCrisis };
      const newPeak = { ...prevPeak };
      for (const [key, val] of Object.entries(newMeters)) {
        const meter = HALL_METERS.find(id => id === key);
        if (meter && val < 20 && !prevCrisis[meter] && CRISIS_EVENTS[meter]) {
          pendingEvent = { ...CRISIS_EVENTS[meter], meter, type: "crisis" };
          newCrisis[meter] = true;
        }
        if (meter && val > 80 && !prevPeak[meter] && PEAK_EVENTS[meter]) {
          pendingEvent = { ...PEAK_EVENTS[meter], meter, type: "peak" };
          newPeak[meter] = true;
        }
        // Reset trigger if meter recovers
        if (val >= 20) Object.assign(newCrisis, {[key]: false});
        if (val <= 80) Object.assign(newPeak, {[key]: false});
      }

      const conParts = Object.entries(consequences)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v > 0 ? "+" : ""}${v}`);
      const conText = conParts.length > 0 ? ` (${conParts.join(", ")})` : "";

      return {
        ...state,
        greatHall: {
          ...prevHall,
          meters: newMeters,
          reputation: repResult.title,
          reputationTrack: repResult.track,
          reputationScores: repResult.scores,
          disputesResolved: resolved,
          stewardTrust: newTrust,
          rulingHistory: newHistory,
          compoundFlags: newCompoundFlags,
          hallLog: [...(prevHall.hallLog || []), disputeLogEntry],
          pendingHallEvent: pendingEvent,
          crisisTriggered: newCrisis,
          peakTriggered: newPeak,
        },
        chronicle: addChronicle(
          state.chronicle,
          `Ruled on a dispute in the Great Hall: "${decree}"${conText}`,
          state.season,
          state.year,
          state.turn,
          "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Audience Response
    // -----------------------------------------------------------------------

    case "HALL_AUDIENCE_RESPOND": {
      const plan = planAudienceResponse(state, action.payload);
      if (!plan) return state;
      const prevHall = state.greatHall;
      let receiptPatch: AudienceReceipts & Pick<HallSaveState, 'compoundFlags'> = {};
      if (plan.receipt) {
        const {field, flag, value} = plan.receipt;
        const compoundFlags = {...prevHall.compoundFlags};
        if (value) compoundFlags[flag] = true;
        else delete compoundFlags[flag];
        receiptPatch = {[field]: value, compoundFlags};
      }

      // Phase 5: Hall log
      const audLogEntry: HallLogEntry = {
        type: "audience",
        text: `Held audience with petitioner`,
        turn: state.turn, season: state.season, year: state.year,
        consequences: plan.consequences,
      };

      return {
        ...state,
        greatHall: {
          ...prevHall,
          meters: plan.meters,
          audienceResolved: [...(prevHall.audienceResolved ?? []), plan.encounterId],
          stewardTrust: plan.stewardTrust,
          hallLog: [...(prevHall.hallLog || []), audLogEntry],
          ...receiptPatch,
        },
        chronicle: addChronicle(
          state.chronicle,
          plan.chronicleText,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Issue Decree
    // -----------------------------------------------------------------------

    case "HALL_ISSUE_DECREE": {
      const plan = planDecreeIssue(state, action.payload);
      if (!plan) return state;
      const { decreeId, effects, used, meters: newMeters } = plan;
      const prevHall = state.greatHall;

      const conParts = Object.entries(effects)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v > 0 ? "+" : ""}${v}`);
      const conText = conParts.length > 0 ? ` (${conParts.join(", ")})` : "";

      // Phase 5: Hall log
      const decreeLogEntry: HallLogEntry = {
        type: "decree",
        text: `Issued decree: ${decreeId}`,
        turn: state.turn, season: state.season, year: state.year,
        consequences: effects,
      };

      return {
        ...state,
        greatHall: {
          ...prevHall,
          meters: newMeters,
          activeDecrees: [...(prevHall.activeDecrees ?? []), decreeId],
          decreeSlotsUsed: used,
          hallLog: [...(prevHall.hallLog || []), decreeLogEntry],
        },
        chronicle: addChronicle(
          state.chronicle,
          `Issued a decree from the Great Hall${conText}`,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Revoke Decree
    // -----------------------------------------------------------------------

    case "HALL_REVOKE_DECREE": {
      const plan = planDecreeRevocation(state, action.payload);
      if (!plan) return state;
      const { decreeId, activeDecrees } = plan;
      const prevHall = state.greatHall;

      // Phase 5: Hall log
      const revokeLogEntry: HallLogEntry = {
        type: "decree_revoke",
        text: `Revoked decree: ${decreeId}`,
        turn: state.turn, season: state.season, year: state.year,
      };

      return {
        ...state,
        greatHall: {
          ...prevHall,
          activeDecrees,
          hallLog: [...(prevHall.hallLog || []), revokeLogEntry],
        },
        chronicle: addChronicle(
          state.chronicle,
          `Revoked a decree in the Great Hall.`,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Council Vote
    // -----------------------------------------------------------------------

    case "HALL_COUNCIL_VOTE": {
      const plan = planCouncilVote(state, action.payload);
      if (!plan) return state;
      const { topicId, consequences, meters: newMeters } = plan;
      const prevHall = state.greatHall;

      const conParts = Object.entries(consequences)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v > 0 ? "+" : ""}${v}`);
      const conText = conParts.length > 0 ? ` (${conParts.join(", ")})` : "";

      // Trust +1 for convening the council
      const cncTrust = Math.min(100, (prevHall.stewardTrust ?? 50) + 1);

      // Phase 5: Hall log
      const councilLogEntry: HallLogEntry = {
        type: "council",
        text: `Council voted on: ${topicId}`,
        turn: state.turn, season: state.season, year: state.year,
        consequences,
      };

      return {
        ...state,
        greatHall: {
          ...prevHall,
          meters: newMeters,
          councilResolved: [...(prevHall.councilResolved ?? []), topicId],
          stewardTrust: cncTrust,
          hallLog: [...(prevHall.hallLog || []), councilLogEntry],
        },
        chronicle: addChronicle(
          state.chronicle,
          `The council voted on a matter in the Great Hall${conText}`,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Feast Complete
    // -----------------------------------------------------------------------

    case "HALL_FEAST_COMPLETE": {
      const prevHall = state.greatHall;
      const feastHistory = Array.isArray(prevHall.feastHistory) ? prevHall.feastHistory : [];
      if (state.phase !== "management" || prevHall.hasFeastedThisSeason ||
          feastHistory.some(entry => entry.season === state.season && entry.year === state.year)) {
        return state;
      }
      const outcome = resolveFeast(action.payload, state.rngState, state.blacksmith);
      if (!outcome) return state;
      const { totalEffects } = outcome;
      const prevMeters = prevHall.meters;

      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const newMeters = {
        people: clamp(prevMeters.people + (totalEffects.people || 0)),
        treasury: clamp(prevMeters.treasury + (totalEffects.treasury || 0)),
        church: clamp(prevMeters.church + (totalEffects.church || 0)),
        military: clamp(prevMeters.military + (totalEffects.military || 0)),
      };

      const conParts = Object.entries(totalEffects)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v > 0 ? "+" : ""}${v}`);
      const conText = conParts.length > 0 ? ` (${conParts.join(", ")})` : "";

      // Trust +3 for hosting a feast (shows generosity)
      const fstTrust = Math.min(100, (prevHall.stewardTrust ?? 50) + 3);

      // Phase 5: Hall log
      const feastLogEntry: HallLogEntry = {
        type: "feast",
        text: "Hosted a feast in the Great Hall",
        turn: state.turn, season: state.season, year: state.year,
        consequences: totalEffects,
      };

      return {
        ...state,
        rngState: outcome.nextRandomState,
        greatHall: {
          ...prevHall,
          meters: newMeters,
          hasFeastedThisSeason: true,
          feastHistory: [...feastHistory, {
            season: state.season,
            year: state.year,
            totalEffects,
            guestId: outcome.selection.guestId,
            entertainmentId: outcome.selection.entertainmentId,
            courseId: outcome.selection.courseId,
            eventId: outcome.event.id,
            ...(outcome.cauldronBonus ? {cauldronBonus: outcome.cauldronBonus} : {}),
          }],
          stewardTrust: fstTrust,
          hallLog: [...(prevHall.hallLog || []), feastLogEntry],
        },
        chronicle: addChronicle(
          state.chronicle,
          `Hosted a feast in the Great Hall${conText}`,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // GREAT HALL — Dismiss Event (Phase 5)
    // -----------------------------------------------------------------------

    case "HALL_DISMISS_EVENT": {
      const plan = planHallEventDismissal(state);
      if (!plan) return state;
      const prevHall = state.greatHall;
      const { event: evt, effects: eff, meters: eMeters } = plan;

      // Log the event
      const evtLogEntry: HallLogEntry = {
        type: evt.type,
        text: evt.chronicle || evt.text,
        turn: state.turn, season: state.season, year: state.year,
        consequences: eff,
      };

      return {
        ...state,
        greatHall: {
          ...prevHall,
          meters: eMeters,
          pendingHallEvent: null,
          hallLog: [...(prevHall.hallLog || []), evtLogEntry],
        },
        chronicle: addChronicle(
          state.chronicle,
          evt.chronicle || "A notable event occurred in the Great Hall.",
          state.season, state.year, state.turn, "event"
        ),
      };
    }

    // -----------------------------------------------------------------------
    // WATCHTOWER actions
    // -----------------------------------------------------------------------
    case "WATCHTOWER_SCAN_COMPLETE": {
      const { scanSeed, foundKeys } = action.payload ?? {};
      const prevWt = state.watchtower ?? {};
      if (state.phase !== "management" || prevWt.scannedThisSeason || scanSeed !== state.rngState) return state;
      const report = summarizeScan(createScanPlan(random), foundKeys);
      if (!report) return state;
      const { total: anomaliesTotal, found: anomaliesFound, rating: scanRating, warnings, foundList } = report;
      const rating = scanRating.label;
      const denariiBonus = scanRating.denariiBonus;
      const { season: wtSeason, year: wtYear, turn: wtTurn } = state;

      const isPerfect = anomaliesFound === anomaliesTotal;

      const foundNames = (foundList ?? []).map((a) => a.name).join(", ");
      const logText = anomaliesFound > 0
        ? `Scanned horizon \u2014 spotted ${foundNames}. Rating: ${rating}.`
        : `Scanned horizon \u2014 clear. No threats spotted. Rating: ${rating}.`;

      const newLog = [
        ...(prevWt.signalLog ?? []),
        { turn: wtTurn, season: wtSeason, year: wtYear, text: logText, type: "scan" },
      ];

      let wtChronicle = addChronicle(
        state.chronicle,
        `You climbed the Watchtower and scanned the horizon. Rating: ${rating}. Spotted ${anomaliesFound} of ${anomaliesTotal} anomalies.`,
        wtSeason, wtYear, wtTurn, "action"
      );

      if (warnings) {
        if (warnings.criminalRaidBonus > 0) {
          wtChronicle = addChronicle(wtChronicle, "Advance warning: campfire smoke spotted \u2014 bandit threat detected.", wtSeason, wtYear, wtTurn, "system");
        }
        if (warnings.scottishRaidBonus > 0) {
          wtChronicle = addChronicle(wtChronicle, "Advance warning: dust cloud spotted \u2014 mounted riders approaching.", wtSeason, wtYear, wtTurn, "system");
        }
        if (warnings.raidRequirementReduction > 0) {
          wtChronicle = addChronicle(wtChronicle, "Advance warning: signal fire spotted \u2014 allied lord warns of military threat.", wtSeason, wtYear, wtTurn, "system");
        }
        if (warnings.merchantPreview) {
          wtChronicle = addChronicle(wtChronicle, `Advance warning: merchant wagon spotted \u2014 ${warnings.merchantPreview.name} approaches with ${warnings.merchantPreview.specialty}.`, wtSeason, wtYear, wtTurn, "system");
        }
      }

      return {
        ...state,
        denarii: state.denarii + (denariiBonus || 0),
        chronicle: wtChronicle,
        resourceDeltas: denariiBonus > 0
          ? { ...state.resourceDeltas, denarii: (state.resourceDeltas?.denarii ?? 0) + denariiBonus }
          : state.resourceDeltas,
        watchtower: {
          ...prevWt,
          scannedThisSeason: true,
          lastScanResult: { anomaliesTotal, anomaliesFound, rating },
          warnings: warnings ?? prevWt.warnings,
          totalScans: (prevWt.totalScans ?? 0) + 1,
          totalAnomaliesSpotted: (prevWt.totalAnomaliesSpotted ?? 0) + (anomaliesFound ?? 0),
          totalAnomaliesMissed: (prevWt.totalAnomaliesMissed ?? 0) + ((anomaliesTotal ?? 0) - (anomaliesFound ?? 0)),
          perfectScans: isPerfect ? (prevWt.perfectScans ?? 0) + 1 : (prevWt.perfectScans ?? 0),
          signalLog: newLog,
        },
      };
    }

    case "WATCHTOWER_RODERIC_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        watchtower: { ...(state.watchtower ?? {}), rodericScribesNoteSeen: true },
      };
    }

    case "WATCHTOWER_SCAN_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        watchtower: { ...(state.watchtower ?? {}), scanScribesNoteSeen: true },
      };
    }

    // -----------------------------------------------------------------------
    // BLACKSMITH_FORGE_COMPLETE — Record a forged item, deduct resources
    // -----------------------------------------------------------------------
    case "BLACKSMITH_FORGE_COMPLETE": {
      const plan = planForgeCompletion(state, action.payload);
      if (!plan) return state;
      const { item, ...patch } = plan;
      return {
        ...state, ...patch,
        chronicle: addChronicle(
          state.chronicle,
          `The forge produced a ${item.grade} ${item.name}${item.grade === "Masterwork" ? " — a masterwork!" : item.grade === "Scrap" ? " — ruined." : "."} (Quality: ${item.qualityScore}%)`,
          state.season, state.year, state.turn, "action"
        ),
      };
    }

    // Owned-item commands share validated identity, movement and chronicle integration.
    case "BLACKSMITH_EQUIP_ITEM":
    case "BLACKSMITH_SELL_ITEM":
    case "BLACKSMITH_SCRAP_ITEM": {
      const plan = planForgeItemAction(state, action.type, 'payload' in action ? action.payload : undefined);
      if (!plan) return state;
      return {...state, ...plan.patch,
        chronicle: addChronicle(state.chronicle, plan.message, state.season, state.year, state.turn, "action")};
    }

    // -----------------------------------------------------------------------
    // BLACKSMITH_BUY_RESOURCE — Purchase forge materials from market
    // -----------------------------------------------------------------------
    case "BLACKSMITH_TALK": {
      const plan = planForgeTalk(state, random);
      // A quiet Talk still advances the saved stream through the reducer wrapper.
      return plan ? {...state, ...plan.patch} : state;
    }

    case "BLACKSMITH_BUY_RESOURCE":
    case "BLACKSMITH_ADVANCE_WAT":
    case "BLACKSMITH_ADVANCE_BANTER":
    case "BLACKSMITH_DISMISS_SUPPLY_EVENT":
    case "BLACKSMITH_INVEST_IRON_VEIN": {
      const plan = planForgeAncillary(state, action.type, 'payload' in action ? action.payload : undefined);
      if (!plan) return state;
      return {...state, ...plan.patch,
        ...(plan.message === null ? {} : {chronicle: addChronicle(state.chronicle, plan.message, state.season, state.year, state.turn, plan.chronicleKind)})};
    }

    // -----------------------------------------------------------------------
    // BLACKSMITH_VISIT — Track forge visits, adjust respect
    // -----------------------------------------------------------------------
    case "BLACKSMITH_VISIT": {
      const blacksmith = planForgeVisit(state);
      return blacksmith ? {...state, blacksmith} : state;
    }

    // -----------------------------------------------------------------------
    case "LOAD_SAVE":
      return { ...action.payload.savedState };

    default:
      return state;
  }
}

export function gameReducer(state: GameSnapshot, action: GameCommand): GameSnapshot {
  if (action.type === "START_GAME" || action.type === "PLAY_AGAIN") {
    return reduceGame(state, action, () => { throw new Error("Start must use its own seed."); });
  }
  const cursor = createRandomCursor(state.rngState === undefined ? seedLegacySnapshot(state) : state.rngState);
  const nextState = reduceGame(state, action, cursor.next);
  return cursor.draws > 0 && nextState !== state ? { ...nextState, rngState: cursor.state } : nextState;
}

export default gameReducer;
