import type {HallLogEntry, HallSaveState} from './hallAudienceState.ts';
import type {GameSnapshot, Season} from '../save/saveGame.ts';
import type {GameCommand} from './gameCommands.ts';
import type {EventDefinition, SeasonalEvent} from '../data/eventTypes.ts';
import type {BuildingId, BuildingDefinition} from '../data/buildings.ts';
import type {ResourceId} from '../data/economy.ts';
import type {RandomSource} from './eventSelector.ts';
import { resolveEventChoice, computeResourceDeltas } from './eventChoice.ts';
import { createInitialState } from './initialGameState.ts';
export { createInitialState } from './initialGameState.ts';
import {getChandelierPrestigeBonus} from "./forgeTools.ts";
import {addChronicle} from './chronicle.ts';
import { planForgeAncillary, planForgeTalk, getForgeSupplyStatus } from './forgeAncillaryActions.ts';
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
  translateEffects,
  applyResourceEffects,
  checkGameOver,
} from "./meterUtils.ts";

import {
  selectSeasonalEvent,
  selectRandomEvent,
} from "./eventSelector.ts";
import { createRandomCursor, DEFAULT_SEED, seedLegacySnapshot } from "./random.ts";
import { createScanPlan, summarizeScan } from "./watchtowerScan.ts";
import { isGambitWager, resolveGambitRound } from "./tavernGambit.ts";
import { addTavernLedgerInteger } from "./tavernLedger.ts";
import { planRatRun, scoreRatRun } from "./ratsInCellar.ts";
import { rollStrangerEncounter, strangerTradeTerms } from "./tavernEncounter.ts";
import { isBardContent, isBardSolvedIds, nextBardContent } from "./tavernBard.ts";
import { isCompanionContent, nextCompanionContent } from "./tavernCompanion.ts";
import { getRecruitmentCapacity } from "../data/militaryRules.ts";
import { resolveFeast } from "./feast.ts";
import { haggleMerchant, isActiveHaggle, isHaggleCounterPrice, isMarketReputation, marketSaleProceeds, marketQuickSalePrice, marketTradePrice, openingHaggleOffer } from "./marketHaggle.ts";

import { simulateEconomy, canBuildBuilding, getTotalFood, getBuildingType, getRepairCost } from "./economyEngine.ts";
import { isBuildingIndex, nextBuildingInstanceId, getUpgradeEligibility } from "./buildingActions.ts";
import { getMilitaryReadiness } from './militaryReadiness.ts';
import { planMilitaryAction } from './militaryActions.ts';
import { isPositivePrice, isPositiveQuantity } from "./transactionValidation.ts";
import { planChapelAction } from "./chapelActions.ts";
import { planPeopleAction } from "./peopleActions.ts";
import { planAudienceResponse } from "./audienceActions.ts";
import { advancePeopleSeason } from "./advancePeopleSeason.ts";
import {getConditionAfterSeason} from './buildingWear.ts';
import {getConstructionCost} from './forgeTools.ts';
import BUILDINGS from "../data/buildings.ts";
import {
  EMPTY_INVENTORY, generateMarketPrices, DIFFICULTY_CONFIGS,
  BASE_BUY_PRICES, BASE_SELL_PRICES,
  MAX_GARRISON,
} from "../data/economy.ts";
import { ALL_FLIPS, isFlipId, checkFlipTriggers, getInitialFlipStats, computeCyoaConsequences, resolveFlipOption, computeFlipConsequences } from "./flipEngine.ts";
import { checkSynergies, advanceSynergyCounters, applySynergyMeterEffects } from "./synergyEngine.ts";
import { SYNERGY_TIER_MAP } from "../data/synergies.ts";
import { getInitialRaidState, checkForRaid, resolveRaid, buildRaidChronicleText } from "./raidEngine.ts";
import { RAID_TYPES } from "../data/raids.ts";
import {
  CRIMINAL_DEFENSE_THRESHOLD, SCOTTISH_DEFENSE_THRESHOLD,
  getMoraleLevel, getTotalGarrison, getMilitaryUpkeep,
  removeFromGarrison,
  getInitialMilitaryState, KNIGHT_NAMES, MILITARY_SCRIBES_NOTES,
} from "../data/military.ts";
import {remainingMarketSupply,consumeMarketSupply} from "./marketSupply.ts";
import { HAGGLE_CONFIG, REPUTATION_CONFIG, LOCAL_MERCHANTS, FOREIGN_TRADERS, pickMarketEvent } from "../data/market.ts";
import { ALDRIC_TRAINING_OFFERS, BARD_RIDDLES, BARD_STATE_COMMENTS, GAMBIT_MAX_ROUNDS, MARTA_OFFERS } from "../data/tavern.ts";
import { computeReputation, computeCompoundFlags, CRISIS_EVENTS, PEAK_EVENTS } from "../data/greatHall.ts";
import { getInitialPeopleState } from "../data/people.ts";
import {
  generateForgeMarketPrices, rollForgeSupplyEvent,
} from "../data/blacksmith.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const HALL_METERS = ['people', 'treasury', 'church', 'military'] as const;
const buildingDefinitions: Readonly<Record<BuildingId, BuildingDefinition>> = BUILDINGS;
const MAX_TURNS = 40;
const MAX_CAUSE_CHAIN = 4;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------



// Title prices are deterministic; each started game gets a separately seeded state.
export const initialState = createInitialState();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function turnToSeasonYear(turn: number) {
  const zeroIndexed = turn - 1;
  const seasonIndex = zeroIndexed % 4;
  const year = Math.floor(zeroIndexed / 4) + 1;
  const season = SEASONS[seasonIndex];
  if (season === undefined) throw new RangeError('Turn has no valid season.');
  return { season, year };
}





/**
 * B-14 FIX: Diminishing-returns faith gain from spice purchases.
 *
 * Spices are marketed as boosting faith each season via church ceremonies.
 * Without a ceiling, spamming spice purchases drives faith near 100.
 * Gain scales down across a year (reset each new year):
 *   1st purchase: +3 faith per unit (full)
 *   2nd-3rd:      +1 faith per unit (half-ish)
 *   4th+:         +0 faith per unit (plateau)
 *
 * @param {number} prevCount  spicePurchasesThisYear BEFORE this buy
 * @param {number} unitsBought number of spice units bought in this transaction
 * @returns {number} total faith delta (integer, >= 0)
 */
function computeSpiceFaithGain(prevCount: number, unitsBought: number) {
  if (unitsBought <= 0) return 0;
  let gain = 0;
  for (let i = 0; i < unitsBought; i++) {
    const n = prevCount + i;
    if (n < 1) gain += 3;
    else if (n < 3) gain += 1;
    else gain += 0;
  }
  return gain;
}

function pickSeasonalEvent(season: Season, usedSeasonalIds: string[], turn: number, allSeasonalEvents: readonly SeasonalEvent[], random: RandomSource) {
  const event = selectSeasonalEvent(season, usedSeasonalIds, turn, allSeasonalEvents, random);
  if (!event) return { event: null, usedSeasonalIds };

  const forSeason = (allSeasonalEvents || []).filter((e) => e.season === season);
  const allUsed = forSeason.every((e) => usedSeasonalIds.includes(e.id));
  const nextUsed = allUsed
    ? [event.id]
    : [...usedSeasonalIds.filter((id) => id !== event.id), event.id];

  return { event, usedSeasonalIds: nextUsed };
}

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
      const difficulty = action.payload?.difficulty || state.difficulty || "normal";
      const config = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.normal;
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

    // -----------------------------------------------------------------------
    // SELL_RESOURCE
    // -----------------------------------------------------------------------
    case "SELL_RESOURCE": {
      const { resource, quantity, merchantId } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (typeof resource !== "string" || !isPositiveQuantity(quantity) ||
          (merchantId === undefined ? !Object.hasOwn(BASE_SELL_PRICES, resource) :
            !haggleMerchant(merchantId, state.season, resource, "sell"))) return state;
      const available = state.inventory[resource] || 0;
      if (available <= 0) return state;

      const sellQty = Math.min(quantity, available);
      const activated = state.synergies?.activated ?? [];
      const price = marketQuickSalePrice(state.marketPrices, state.season, merchantId, resource, activated) || 0;
      if (!isPositivePrice(price)) return state;
      const isWoolish = resource === "wool" || resource === "cloth";
      const income = marketSaleProceeds(price, sellQty, resource, state.blacksmith);
      const newInventory = { ...state.inventory, [resource]: available - sellQty };

      const prevSynergies = state.synergies ?? {};
      const newWoolTrades = prevSynergies.woolTrades + (isWoolish ? sellQty : 0);
      const newTradeTypes = prevSynergies.tradeTypes.includes(resource)
        ? prevSynergies.tradeTypes
        : [...prevSynergies.tradeTypes, resource];

      const sellCfg: Partial<Record<ResourceId, string>> = { grain: "Grain", livestock: "Livestock", fish: "Fish", timber: "Timber", clay: "Clay", iron: "Iron", stone: "Stone", wool: "Wool", cloth: "Cloth", honey: "Honey", herbs: "Herbs", ale: "Ale" };
      return {
        ...state,
        inventory: newInventory,
        denarii: state.denarii + income,
        food: getTotalFood(newInventory),
        tradeCount: (state.tradeCount || 0) + 1,
        synergies: { ...prevSynergies, woolTrades: newWoolTrades, tradeTypes: newTradeTypes },
        chronicle: addChronicle(state.chronicle, `Sold ${sellQty} ${sellCfg[resource] || resource} for ${income}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // BUY_RESOURCE
    // -----------------------------------------------------------------------
    case "BUY_RESOURCE": {
      const { resource, quantity, merchantId } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (typeof resource !== "string" || !isPositiveQuantity(quantity) ||
          (merchantId === undefined ? !Object.hasOwn(BASE_BUY_PRICES, resource) :
            !haggleMerchant(merchantId, state.season, resource, "buy"))) return state;

      const price = marketTradePrice(state.marketPrices, state.season, merchantId, resource, "buy") || 0;
      if (!isPositivePrice(price)) return state;

      const maxAfford = Math.floor(state.denarii / price);
      const buyQty = Math.min(quantity, maxAfford, remainingMarketSupply(state.market,state.turn,resource));
      if (buyQty <= 0) return state;

      const supply=consumeMarketSupply(state.market,state.turn,resource,buyQty);
      if(!supply)return state;
      const totalCost = price * buyQty;
      const currentQty = state.inventory[resource] || 0;
      const newInventory = { ...state.inventory, [resource]: currentQty + buyQty };

      const prevSynergies = state.synergies ?? {};
      const newSpicePurchases = prevSynergies.spicePurchases + (resource === "spices" ? buyQty : 0);
      const newTradeTypes = prevSynergies.tradeTypes.includes(resource)
        ? prevSynergies.tradeTypes
        : [...prevSynergies.tradeTypes, resource];

      // B-14 FIX: diminishing-returns faith gain on spice buys.
      const prevChapelBuy = state.chapel ?? {};
      const prevSpiceYearBuy = prevChapelBuy.spicePurchasesThisYear ?? 0;
      const faithGainBuy = resource === "spices"
        ? computeSpiceFaithGain(prevSpiceYearBuy, buyQty)
        : 0;
      const nextChapelBuy = resource === "spices"
        ? {
            ...prevChapelBuy,
            faith: Math.min(100, Math.max(0, (prevChapelBuy.faith ?? 50) + faithGainBuy)),
            spicePurchasesThisYear: prevSpiceYearBuy + buyQty,
          }
        : prevChapelBuy;

      const buyCfg: Partial<Record<ResourceId, string>> = { grain: "Grain", livestock: "Livestock", fish: "Fish", timber: "Timber", clay: "Clay", iron: "Iron", stone: "Stone", salt: "Salt", tools: "Tools", spices: "Spices" };
      return {
        ...state,
        denarii: state.denarii - totalCost,
        market:{...state.market,supply},
        inventory: newInventory,
        food: getTotalFood(newInventory),
        tradeCount: (state.tradeCount || 0) + 1,
        synergies: { ...prevSynergies, spicePurchases: newSpicePurchases, tradeTypes: newTradeTypes },
        chapel: nextChapelBuy,
        chronicle: addChronicle(state.chronicle, `Bought ${buyQty} ${buyCfg[resource] || resource} for ${totalCost}d.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // HAGGLE_START — Player approaches a merchant to haggle
    // -----------------------------------------------------------------------
    case "HAGGLE_START": {
      const { merchantId, resource, quantity, mode } = action.payload ?? {};
      if (state.phase !== "management") return state;
      if (!isMarketReputation(state.market?.reputation)) return state;
      if (state.market?.activeHaggle) return state;
      if (state.market?.activeMarketEvent?.effect?.noHaggling) return state;
      if (!isPositiveQuantity(quantity) || typeof resource !== "string" ||
          (mode !== "sell" && mode !== "buy")) return state;
      if (quantity > 1_000_000) return state;
      const merchant = haggleMerchant(merchantId, state.season, resource, mode);
      if (!merchant) return state;

      const fairPrice = marketTradePrice(state.marketPrices, state.season, merchantId, resource, mode);
      if (!Number.isSafeInteger(fairPrice) || !isPositivePrice(fairPrice)) return state;
      if (mode === "buy" && (quantity > Math.floor(state.denarii / fairPrice)||quantity>remainingMarketSupply(state.market,state.turn,resource))) return state;

      const difficulty = merchant.difficulty;

      const rep = state.market?.reputation?.[merchantId] ?? 50;
      const openingOffer = openingHaggleOffer(fairPrice, difficulty, mode, rep);

      const qty = Math.min(quantity, mode === "sell" ? (state.inventory[resource] || 0) : quantity);
      if (qty <= 0) return state;

      return {
        ...state,
        market: {
          ...state.market,
          activeHaggle: {
            merchantId, mode, resource, quantity: qty, fairPrice,
            currentOffer: openingOffer, playerCounter: null,
            round: 1, maxRounds: HAGGLE_CONFIG.maxRounds,
            difficulty, status: "open",
          },
        },
      };
    }

    // -----------------------------------------------------------------------
    // HAGGLE_COUNTER — Player makes a counter-offer
    // -----------------------------------------------------------------------
    case "HAGGLE_COUNTER": {
      const { counterPrice } = action.payload ?? {};
      if (state.phase !== "management") return state;
      const haggle = state.market?.activeHaggle;
      if (!haggle || haggle.status !== "open") return state;
      if (!isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation) ||
          !isHaggleCounterPrice(counterPrice, haggle.fairPrice, haggle.mode)) return state;

      const { fairPrice, currentOffer, round, maxRounds, difficulty, mode } = haggle;

      const priceDiff = mode === "sell"
        ? (counterPrice - fairPrice) / fairPrice
        : (fairPrice - counterPrice) / fairPrice;

      const chances = HAGGLE_CONFIG.acceptChance[difficulty] || HAGGLE_CONFIG.acceptChance.medium;
      let acceptProb = 0;
      if (priceDiff <= 0.10) acceptProb = chances.withinTenPercent;
      else if (priceDiff <= 0.20) acceptProb = chances.withinTwenty;
      else acceptProb = chances.aboveMarket;

      if (random() < acceptProb) {
        return {
          ...state,
          market: {
            ...state.market,
            activeHaggle: { ...haggle, currentOffer: counterPrice, playerCounter: counterPrice, status: "accepted", round },
          },
        };
      }

      const step = HAGGLE_CONFIG.counterStep[difficulty] || 0.5;
      let newOffer;
      if (mode === "sell") {
        newOffer = Math.max(1, Math.round(currentOffer + (counterPrice - currentOffer) * step));
      } else {
        newOffer = Math.max(1, Math.round(currentOffer - (currentOffer - counterPrice) * step));
      }

      const newRound = round + 1;
      return {
        ...state,
        market: {
          ...state.market,
          activeHaggle: { ...haggle, currentOffer: newOffer, playerCounter: counterPrice, round: newRound, status: newRound >= maxRounds ? "final" : "open" },
        },
      };
    }

    // -----------------------------------------------------------------------
    // HAGGLE_ACCEPT — Player accepts the current offer
    // -----------------------------------------------------------------------
    case "HAGGLE_ACCEPT": {
      if (state.phase !== "management") return state;
      const haggle = state.market?.activeHaggle;
      if (!haggle) return state;
      if (!isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation)) return state;

      const { merchantId, mode, resource, quantity, currentOffer, fairPrice } = haggle;
      if (!isPositiveQuantity(quantity) || !isPositivePrice(currentOffer) || !isPositivePrice(fairPrice) ||
          typeof resource !== "string" || (mode !== "sell" && mode !== "buy")) return state;
      const price = currentOffer;
      const prevMarket = state.market ?? {};
      const prevSynergies = state.synergies ?? {};
      const LABEL: Partial<Record<ResourceId, string>> = { grain: "Grain", livestock: "Livestock", fish: "Fish", timber: "Timber", clay: "Clay", iron: "Iron", stone: "Stone", wool: "Wool", cloth: "Cloth", honey: "Honey", herbs: "Herbs", ale: "Ale", salt: "Salt", tools: "Tools", spices: "Spices" };

      let newState;
      if (mode === "sell") {
        const available = state.inventory[resource] || 0;
        if (available < quantity) return state;
        const sellQty = quantity;
        const income = marketSaleProceeds(price, sellQty, resource, state.blacksmith);
        const newInventory = { ...state.inventory, [resource]: available - sellQty };
        const isWoolish = resource === "wool" || resource === "cloth";
        const newWoolTrades = prevSynergies.woolTrades + (isWoolish ? sellQty : 0);
        const newTradeTypes = prevSynergies.tradeTypes.includes(resource)
          ? prevSynergies.tradeTypes : [...prevSynergies.tradeTypes, resource];
        const mName = LOCAL_MERCHANTS.find(m => m.id === merchantId)?.name || FOREIGN_TRADERS[state.season]?.name || "a merchant";
        newState = {
          ...state, inventory: newInventory, denarii: state.denarii + income,
          food: getTotalFood(newInventory), tradeCount: (state.tradeCount || 0) + 1,
          synergies: { ...prevSynergies, woolTrades: newWoolTrades, tradeTypes: newTradeTypes },
          chronicle: addChronicle(state.chronicle, `Sold ${sellQty} ${LABEL[resource] || resource} to ${mName} for ${income}d (haggled from ${fairPrice}d each).`, state.season, state.year, state.turn, "action"),
        };
      } else {
        const totalCost = price * quantity;
        const supply=consumeMarketSupply(prevMarket,state.turn,resource,quantity);
        if (!supply||state.denarii < totalCost) return state;
        const currentQty = state.inventory[resource] || 0;
        const newInventory = { ...state.inventory, [resource]: currentQty + quantity };
        const newSpicePurchases = prevSynergies.spicePurchases + (resource === "spices" ? quantity : 0);
        const newTradeTypes = prevSynergies.tradeTypes.includes(resource)
          ? prevSynergies.tradeTypes : [...prevSynergies.tradeTypes, resource];
        const mName = LOCAL_MERCHANTS.find(m => m.id === merchantId)?.name || FOREIGN_TRADERS[state.season]?.name || "a merchant";

        // B-14 FIX: diminishing-returns faith gain on spice buys (same as BUY_RESOURCE).
        const prevChapelHag = state.chapel ?? {};
        const prevSpiceYearHag = prevChapelHag.spicePurchasesThisYear ?? 0;
        const faithGainHag = resource === "spices"
          ? computeSpiceFaithGain(prevSpiceYearHag, quantity)
          : 0;
        const nextChapelHag = resource === "spices"
          ? {
              ...prevChapelHag,
              faith: Math.min(100, Math.max(0, (prevChapelHag.faith ?? 50) + faithGainHag)),
              spicePurchasesThisYear: prevSpiceYearHag + quantity,
            }
          : prevChapelHag;

        newState = {
          ...state, denarii: state.denarii - totalCost, inventory: newInventory,
          market:{...prevMarket,supply},
          food: getTotalFood(newInventory), tradeCount: (state.tradeCount || 0) + 1,
          synergies: { ...prevSynergies, spicePurchases: newSpicePurchases, tradeTypes: newTradeTypes },
          chapel: nextChapelHag,
          chronicle: addChronicle(state.chronicle, `Bought ${quantity} ${LABEL[resource] || resource} from ${mName} for ${totalCost}d (haggled from ${fairPrice}d each).`, state.season, state.year, state.turn, "action"),
        };
      }

      const wonHaggle = mode === "sell" ? price >= fairPrice * 0.9 : price <= fairPrice * 1.1;
      const wasFair = Math.abs(price - fairPrice) / fairPrice <= 0.1;
      let repChange = REPUTATION_CONFIG.anyDeal;
      if (wasFair) repChange += REPUTATION_CONFIG.fairDeal;
      if (haggle.round === 1) repChange += REPUTATION_CONFIG.quickAccept;
      const prevRep = prevMarket.reputation?.[merchantId] ?? 50;
      const newRep = Math.max(REPUTATION_CONFIG.min, Math.min(REPUTATION_CONFIG.max, prevRep + repChange));

      return {
        ...newState,
        market: {
          ...prevMarket, ...newState.market, activeHaggle: null,
          reputation: { ...prevMarket.reputation, [merchantId]: newRep },
          tradesThisSeason: (prevMarket.tradesThisSeason || 0) + 1,
          totalTradesLifetime: (prevMarket.totalTradesLifetime || 0) + 1,
          totalHagglesWon: (prevMarket.totalHagglesWon || 0) + (wonHaggle ? 1 : 0),
          totalHagglesLost: (prevMarket.totalHagglesLost || 0) + (wonHaggle ? 0 : 1),
          denariiEarnedFromTrade: (prevMarket.denariiEarnedFromTrade || 0) + (mode === "sell" ? marketSaleProceeds(currentOffer, quantity, resource, state.blacksmith) : 0),
          denariiSpentOnTrade: (prevMarket.denariiSpentOnTrade || 0) + (mode === "buy" ? currentOffer * quantity : 0),
          haggleTradesUsed: (prevMarket.haggleTradesUsed || 0) + 1,
          lastTradedSeason: { ...(prevMarket.lastTradedSeason ?? {}), [merchantId]: state.turn },
        },
      };
    }

    // -----------------------------------------------------------------------
    // HAGGLE_WALK_AWAY — Player abandons the current haggle
    // -----------------------------------------------------------------------
    case "HAGGLE_WALK_AWAY": {
      if (state.phase !== "management") return state;
      const haggle = state.market?.activeHaggle;
      if (!haggle) return state;
      if (!isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation)) return state;
      const { merchantId } = haggle;
      const prevMarket = state.market ?? {};
      const prevRep = prevMarket.reputation?.[merchantId] ?? 50;
      const newRep = Math.max(REPUTATION_CONFIG.min, prevRep + REPUTATION_CONFIG.walkAway);
      return {
        ...state,
        market: { ...prevMarket, activeHaggle: null, reputation: { ...prevMarket.reputation, [merchantId]: newRep } },
        chronicle: addChronicle(state.chronicle, "You walked away from a deal at the market.", state.season, state.year, state.turn, "action"),
      };
    }

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
      if (!amount || amount <= 0) return state;
      if (state.denarii < amount) return state;

      return {
        ...state,
        denarii: state.denarii - amount,
        churchDonation: (state.churchDonation || 0) + amount,
        chronicle: addChronicle(state.chronicle, `Donated ${amount}d to the Church.`, state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // SIMULATE_SEASON
    // -----------------------------------------------------------------------
    case "SIMULATE_SEASON": {
      if (state.phase !== "management") return state;

      // Victory check BEFORE any season processing — prevents raids/events
      // from firing after the final turn (BUG 4 fix)
      if (state.turn >= MAX_TURNS) {
        // Pyrrhic victory: survived but barely — population too low
        const isPyrrhic = state.population < 3;
        const victoryText = isPyrrhic
          ? "Ten years have passed, but at what cost? Your estate barely clings to life. " +
            "The chronicles will note your survival, though few remain to read them."
          : "Ten years have passed. Your reign has endured through war, famine, and feast. " +
            "The chronicles will remember your name.";
        const { season: vSeason, year: vYear } = turnToSeasonYear(state.turn);
        return {
          ...state,
          phase: "victory",
          pyrrhicVictory: isPyrrhic,
          chronicle: addChronicle(state.chronicle, victoryText, vSeason, vYear, state.turn, "system"),
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
        };
      }

      const { seasonalEvents = [] } = action.payload ?? {};
      const { turn, season, year, usedSeasonalIds } = state;

      // Snapshot before economy
      const before = { denarii: state.denarii, food: state.food, population: state.population, garrison: state.garrison };

      // 1. Run the full economic simulation
      const econResult = simulateEconomy({
        denarii: state.denarii,
        population: state.population,
        inventory: state.inventory,
        inventoryCapacity: state.inventoryCapacity,
        buildings: state.buildings,
        blacksmith: state.blacksmith,
        garrison: state.garrison,
        castleLevel: state.castleLevel,
        taxRate: state.taxRate,
        season,
        difficulty: state.difficulty,
        churchDonation: state.churchDonation ?? 0,
        synergies: state.synergies,
        military: state.military,
      }, random);

      // 1.5. MORALE & TYPED GARRISON RECONCILIATION
      const prevMil = state.military ?? getInitialMilitaryState(state.garrison);
      let milMorale = prevMil.morale ?? 50;
      let milGarrison = { ...prevMil.garrison };
      let milDesertions = 0;

      // Reconcile garrison if economy engine removed soldiers (food shortage/unpaid upkeep)
      const totalBefore = getTotalGarrison(milGarrison);
      const totalAfter = econResult.garrison;
      if (totalAfter < totalBefore) {
        const deserted = totalBefore - totalAfter;
        milGarrison = removeFromGarrison(milGarrison, deserted);
        milDesertions += deserted;
      }

      // Morale: upkeep paid?
      const upkeepCost = getMilitaryUpkeep(prevMil.garrison);
      if (upkeepCost > 0 && econResult.denarii >= 0) {
        milMorale = Math.min(100, milMorale + 2);
      } else if (upkeepCost > 0 && econResult.denarii <= 0) {
        milMorale = Math.max(0, milMorale - 10);
      }

      // Morale: food stores (tiered thresholds scaled to population)
      const foodPerPerson = econResult.population > 0 ? econResult.food / econResult.population : 0;
      if (foodPerPerson > 5) {
        milMorale = Math.min(100, milMorale + 3);
      } else if (foodPerPerson > 3) {
        milMorale = Math.min(100, milMorale + 1);
      } else if (econResult.food <= 0) {
        milMorale = Math.max(0, milMorale - 15);
      } else if (foodPerPerson < 1) {
        milMorale = Math.max(0, milMorale - 8);
      } else if (foodPerPerson < 2) {
        milMorale = Math.max(0, milMorale - 3);
      }

      // Morale: population unhappiness
      if (econResult.population < 10) {
        milMorale = Math.max(0, milMorale - 3);
      }

      // Morale: natural drift toward equilibrium (70)
      // Above 70: decay scales with distance. Below 30: slow recovery.
      if (milMorale > 85) {
        milMorale -= 3;
      } else if (milMorale > 70) {
        milMorale -= 2;
      } else if (milMorale < 30) {
        milMorale = Math.min(30, milMorale + 2);
      }

      // Track idle seasons (used for narrative flavor, no morale penalty)
      const idleSeasons = (prevMil.idleSeasons || 0) + 1;

      // Morale: mutinous desertion (10% chance per levy)
      const moraleLevel = getMoraleLevel(milMorale);
      if (moraleLevel.desertionChance > 0 && milGarrison.levy > 0) {
        let levyDeserted = 0;
        for (let i = 0; i < milGarrison.levy; i++) {
          if (random() < moraleLevel.desertionChance) levyDeserted++;
        }
        if (levyDeserted > 0) {
          milGarrison = { ...milGarrison, levy: milGarrison.levy - levyDeserted };
          milDesertions += levyDeserted;
          econResult.report.push(`${levyDeserted} levy ${levyDeserted === 1 ? "peasant" : "peasants"} deserted due to mutinous morale.`);
        }
      }

      // Knights abandon if population too low (scaled by difficulty)
      const knightPopThreshold = { easy: 10, normal: 8, hard: 5 }[state.difficulty || "normal"] || 8;
      if (milGarrison.knights > 0 && econResult.population < knightPopThreshold) {
        const knightName = KNIGHT_NAMES[Math.floor(random() * KNIGHT_NAMES.length)];
        milGarrison = { ...milGarrison, knights: milGarrison.knights - 1 };
        milDesertions += 1;
        econResult.report.push(`${knightName} has abandoned your service, disgusted by the state of your people.`);
      }

      const updatedMilitary = {
        ...prevMil,
        garrison: milGarrison,
        morale: milMorale,
        idleSeasons,
        totalUpkeepSpending: (prevMil.totalUpkeepSpending || 0) + upkeepCost,
        soldiersLostToDesertion: (prevMil.soldiersLostToDesertion || 0) + milDesertions,
      };

      // Update the total garrison count
      const finalGarrison = getTotalGarrison(milGarrison);
      econResult.garrison = finalGarrison;

      // 2. Track bankruptcy
      let bankruptcyTurns = state.bankruptcyTurns || 0;
      if (econResult.denarii <= 0) {
        bankruptcyTurns += 1;
      } else {
        bankruptcyTurns = 0;
      }

      // 2b. Track starvation (food at 0 for consecutive turns)
      let starvationTurns = state.starvationTurns || 0;
      if (econResult.food <= 0) {
        starvationTurns += 1;
      } else {
        starvationTurns = 0;
      }

      // 3. Add economic report to chronicle
      let nextChronicle = state.chronicle;
      for (const line of econResult.report) {
        nextChronicle = addChronicle(nextChronicle, line, season, year, turn, "system");
      }

      // 3.5. BUILDING DEGRADATION — condition decays each season
      const degradedBuildings = state.buildings.map((b) => typeof b === "string" ? b :
        { ...b, condition: getConditionAfterSeason(b, season, state.blacksmith) });

      // Report condition warnings
      for (const b of degradedBuildings) {
        if (typeof b === "string") continue;
        const def = BUILDINGS[getBuildingType(b)];
        if (!def) continue;
        const orig = state.buildings.find((sb) => typeof sb !== "string" && sb.instanceId === b.instanceId);
        if (b.condition < 25 && orig && typeof orig !== 'string' && orig.condition >= 25) {
          nextChronicle = addChronicle(nextChronicle, `Your ${def.name} has fallen into ruin and produces nothing until repaired.`, season, year, turn, "system");
        } else if (b.condition < 50 && b.condition >= 25 && orig && typeof orig !== 'string' && orig.condition >= 50) {
          nextChronicle = addChronicle(nextChronicle, `Your ${def.name} is in poor condition \u2014 output reduced by half.`, season, year, turn, "system");
        }
      }

      // 3.6. ECONOMY HISTORY — track for trend display
      const newEconomyHistory = [...(state.economyHistory ?? []), {
        turn,
        season,
        netGold: econResult.denarii - state.denarii,
        netFood: econResult.food - state.food,
      }].slice(-8);

      // 3.7 PEOPLE — tiers, loyalty, departures, feed
      const peopleSeason = advancePeopleSeason({ ...state, season, year }, econResult, random);
      const updatedPeople = peopleSeason.people;
      for (const text of peopleSeason.chronicleTexts) {
        nextChronicle = addChronicle(nextChronicle, text, season, year, turn, "event");
      }

      // 4. Check game over from economy
      const afterState = {
        population: econResult.population,
        bankruptcyTurns,
        starvationTurns,
        difficulty: state.difficulty,
      };
      const econGameOver = checkGameOver(afterState);
      if (econGameOver) {
        return {
          ...state,
          denarii: econResult.denarii,
          food: econResult.food,
          population: econResult.population,
          garrison: econResult.garrison,
          inventory: econResult.inventory,
          buildings: degradedBuildings,
          economyHistory: newEconomyHistory,
          chronicle: nextChronicle,
          seasonReport: econResult.report,
          resourceDeltas: computeResourceDeltas(before, {
            denarii: econResult.denarii,
            food: econResult.food,
            population: econResult.population,
            garrison: econResult.garrison,
          }),
          bankruptcyTurns,
          starvationTurns,
          phase: "game_over",
          gameOverReason: econGameOver,
          currentEvent: null,
          currentRandomEvent: null,
          churchDonation: 0,
          military: updatedMilitary,
          people: updatedPeople,
        };
      }

      // 5. Pick the seasonal event
      const { event: seasonalEvent, usedSeasonalIds: nextUsedSeasonalIds } = pickSeasonalEvent(
        season,
        usedSeasonalIds,
        turn,
        seasonalEvents,
        random,
      );

      // Reset tavern seasonal limits
      const tavernSeasonReset = {
        ...state.tavern,
        gambitRoundsThisSeason: 0,
        ratsPlayedThisSeason: false,
        strangerAppearedThisSeason: false,
        pendingStrangerEncounter: null,
      };

      // Reset watchtower seasonal state, clear one-season warnings
      const prevWt = state.watchtower ?? {};
      const watchtowerSeasonReset = {
        ...prevWt,
        scannedThisSeason: false,
        lastScanResult: null,
        warnings: {
          criminalRaidBonus: 0,
          scottishRaidBonus: 0,
          raidRequirementReduction: 0,
          merchantPreview: null,
        },
      };

      // Reset market seasonal state and pick market event
      const prevMkt = state.market ?? {};
      const marketEvent = pickMarketEvent(turn, prevMkt.usedMarketEventIds || [], random);
      const marketSeasonReset = {
        ...prevMkt,
        activeHaggle: null,
        tradesThisSeason: 0,
        activeMarketEvent: marketEvent,
        usedMarketEventIds: marketEvent
          ? [...(prevMkt.usedMarketEventIds || []), marketEvent.id]
          : (prevMkt.usedMarketEventIds || []),
      };

      if (marketEvent) {
        nextChronicle = addChronicle(nextChronicle, `Market: ${marketEvent.title} \u2014 ${marketEvent.description}`, season, year, turn, "event");
      }

      // Resolve Marta's spice investment
      let finalDenarii = econResult.denarii;
      if (tavernSeasonReset.martaSpiceInvestment) {
        if (random() < 0.85) {
          finalDenarii += 120;
          nextChronicle = addChronicle(nextChronicle, "Marta\u2019s spice shipment arrived! +120d.", season, year, turn, "action");
        } else {
          nextChronicle = addChronicle(nextChronicle, "Marta\u2019s spice shipment was lost to bandits. Your 75d investment is gone.", season, year, turn, "event");
        }
        tavernSeasonReset.martaSpiceInvestment = false;
      }

      // Decrement Aldric's drill buff
      if ((tavernSeasonReset.aldricDrillActive ?? 0) > 0) {
        tavernSeasonReset.aldricDrillActive = (tavernSeasonReset.aldricDrillActive ?? 0) - 1;
        if (tavernSeasonReset.aldricDrillActive === 0) {
          nextChronicle = addChronicle(nextChronicle, "Aldric\u2019s training effect has faded.", season, year, turn, "system");
        }
      }

      // --- BLACKSMITH SEASON PROCESSING ---
      const prevBs = state.blacksmith ?? {};
      let forgeInv = econResult.inventory;
      const forgeSeasonReset = { ...prevBs, salesThisSeason: 0 };

      // Iron vein passive production
      if (prevBs.ironVeinActive) {
        forgeInv = { ...forgeInv, iron: (forgeInv.iron || 0) + 3 };
        nextChronicle = addChronicle(nextChronicle, "The iron vein yielded 3 bars.", season, year, turn, "system");
      }

      // Record price history snapshot
      const currentForgePrices = generateForgeMarketPrices(season, random);
      forgeSeasonReset.priceHistory = [...(prevBs.priceHistory || []).slice(-12), {
        turn, season, prices: currentForgePrices,
      }];
      forgeSeasonReset.marketPrices = currentForgePrices;

      // Supply event countdown
      const currentSupply = getForgeSupplyStatus(prevBs);
      if (currentSupply?.event && currentSupply.event.duration > 0) {
        forgeSeasonReset.supplyEventTurnsLeft = Math.max(0, currentSupply.remaining - 1);
        if (forgeSeasonReset.supplyEventTurnsLeft <= 0) {
          forgeSeasonReset.activeSupplyEvent = null;
          nextChronicle = addChronicle(nextChronicle, "The forge supply disruption has ended.", season, year, turn, "system");
        }
      }

      // Roll for new supply event (if none active)
      if (!forgeSeasonReset.activeSupplyEvent) {
        const newForgeEvent = rollForgeSupplyEvent(turn, forgeSeasonReset.usedSupplyEventIds || [], random);
        if (newForgeEvent) {
          forgeSeasonReset.activeSupplyEvent = newForgeEvent;
          forgeSeasonReset.supplyEventTurnsLeft = newForgeEvent.duration || 0;
        }
      }

      // Equipped items update econResult inventory
      econResult.inventory = forgeInv;

      // --- RAID CHECK (after production, before seasonal events) ---
      const prevRaids = state.raids ?? getInitialRaidState();
      const raidsWithCooldowns = {
        ...prevRaids,
        criminalCooldown: Math.max(0, (prevRaids.criminalCooldown || 0) - 1),
        scottishCooldown: Math.max(0, (prevRaids.scottishCooldown || 0) - 1),
      };
      const raidTrigger = checkForRaid(raidsWithCooldowns, turn, random);

      if (raidTrigger) {
        // Capture readiness before the seasonal drill counter expires. A raid in
        // the third covered season still benefits even though the next turn does not.
        const { drillBonus, baseDefense: defenseRating } = getMilitaryReadiness({
          ...state, military: updatedMilitary, garrison: econResult.garrison,
          blacksmith: forgeSeasonReset,
        });
        // Raid triggered — pause season at raid_warning phase
        return {
          ...state,
          denarii: finalDenarii,
          food: econResult.food,
          population: econResult.population,
          garrison: econResult.garrison,
          inventory: econResult.inventory,
          buildings: degradedBuildings,
          economyHistory: newEconomyHistory,
          chronicle: nextChronicle,
          seasonReport: econResult.report,
          resourceDeltas: computeResourceDeltas(before, {
            denarii: finalDenarii,
            food: econResult.food,
            population: econResult.population,
            garrison: econResult.garrison,
          }),
          bankruptcyTurns,
          starvationTurns,
          phase: "raid_warning",
          currentEvent: seasonalEvent,
          usedSeasonalIds: nextUsedSeasonalIds,
          activeTab: "chronicle",
          churchDonation: 0,
          tavern: tavernSeasonReset,
          watchtower: watchtowerSeasonReset,
          market: marketSeasonReset,
          military: updatedMilitary,
          people: updatedPeople,
          blacksmith: forgeSeasonReset,
          raids: {
            ...raidsWithCooldowns,
            activeRaid: { type: raidTrigger.type, phase: "warning", result: null, drillBonus, defenseRating },
          },
        };
      }

      return {
        ...state,
        denarii: finalDenarii,
        food: econResult.food,
        population: econResult.population,
        garrison: econResult.garrison,
        inventory: econResult.inventory,
        buildings: degradedBuildings,
        economyHistory: newEconomyHistory,
        chronicle: nextChronicle,
        seasonReport: econResult.report,
        resourceDeltas: computeResourceDeltas(before, {
          denarii: finalDenarii,
          food: econResult.food,
          population: econResult.population,
          garrison: econResult.garrison,
        }),
        bankruptcyTurns,
        starvationTurns,
        phase: (seasonalEvent && seasonalEvent.options?.length > 0) ? "seasonal_action" : "seasonal_resolve",
        currentEvent: (seasonalEvent && seasonalEvent.options?.length > 0) ? seasonalEvent : null,
        usedSeasonalIds: nextUsedSeasonalIds,
        activeTab: "chronicle",
        churchDonation: 0,
        tavern: tavernSeasonReset,
        watchtower: watchtowerSeasonReset,
        market: marketSeasonReset,
        military: updatedMilitary,
        people: updatedPeople,
        blacksmith: forgeSeasonReset,
        raids: { ...raidsWithCooldowns, activeRaid: null },
      };
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
      const { optionIndex } = action.payload ?? {};
      const { currentEvent, phase } = state;

      if (phase !== "seasonal_action" || !currentEvent) return state;

      const settled = resolveEventChoice(state, currentEvent, optionIndex, "action");
      const partial = {...settled, military: settled.military ?? state.military};

      if (partial.gameOverReason) {
        return {
          ...state,
          ...partial,
          phase: "game_over",
          currentEvent: null,
        };
      }

      return {
        ...state,
        ...partial,
        phase: "seasonal_resolve",
      };
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
      const { optionIndex } = action.payload ?? {};
      const { currentRandomEvent, phase } = state;

      if (phase !== "random_event" || !currentRandomEvent) return state;

      const settled = resolveEventChoice(state, currentRandomEvent, optionIndex, "event");
      const partial = {...settled, military: settled.military ?? state.military};

      if (partial.gameOverReason) {
        return {
          ...state,
          ...partial,
          phase: "game_over",
          currentRandomEvent: null,
        };
      }

      return {
        ...state,
        ...partial,
        phase: "random_resolve",
        militaryEventEverFired: state.militaryEventEverFired || (currentRandomEvent?.requiresMeter === "military"),
      };
    }

    // -----------------------------------------------------------------------
    // ADVANCE_TURN
    // -----------------------------------------------------------------------
    case "ADVANCE_TURN": {
      const { phase, turn, chronicle } = state;

      if (phase !== "random_resolve" && phase !== "seasonal_resolve") return state;

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
      const advanceCompoundFlags = computeCompoundFlags(prevHallAdvance.rulingHistory || []);

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
      const newSynergyIds = checkSynergies(stateForSynergyCheck);

      let synergiesAfterCheck = updatedSynergies;
      let synChronicle = nextChronicle;
      const synNotifications = [];

      if (newSynergyIds.length > 0) {
        synergiesAfterCheck = {
          ...updatedSynergies,
          activated: [...(updatedSynergies.activated ?? []), ...newSynergyIds],
        };
        for (const tierId of newSynergyIds) {
          const entry = SYNERGY_TIER_MAP[tierId];
          if (entry?.tier.chronicle) {
            synChronicle = addChronicle(
              synChronicle, entry.tier.chronicle, nextSeason, nextYear, nextTurn, "event",
            );
          }
          synNotifications.push({
            tierId,
            tier: entry?.tier.tier ?? 1,
            title: entry?.tier.title ?? "",
            description: entry?.tier.description ?? "",
            pathName: entry?.path.name ?? "",
            pathIcon: entry?.path.icon ?? "",
            pathColor: entry?.path.color ?? "#b8860b",
            scribesNote: entry?.tier.scribesNote ?? null,
          });
        }
      }

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
    case "DISMISS_FLIP_INTRO": {
      if (state.phase !== "flip_intro") return state;
      const flipForIntro = isFlipId(state.currentFlipId) ? ALL_FLIPS[state.currentFlipId] : null;
      // BUG-04 guard: if flip data is missing, recover to management
      if (!flipForIntro) {
        return {
          ...state,
          phase: "management",
          currentFlipId: null,
          currentFlipStats: null,
          currentDecisionIndex: 0,
          flipConsequenceFlags: [],
          currentFlipOutcome: null,
          currentCyoaNodeId: null,
          cyoaEndingType: null,
        };
      }
      if (flipForIntro.type === "cyoa") {
        return { ...state, phase: "flip_decision", currentCyoaNodeId: flipForIntro.startNode };
      }
      return { ...state, phase: "flip_decision" };
    }

    case "SELECT_FLIP_OPTION": {
      if (state.phase !== "flip_decision") return state;
      const { optionIndex } = action.payload ?? {};
      if (!isFlipId(state.currentFlipId)) return state;
      const flip = ALL_FLIPS[state.currentFlipId];
      if (!flip) return state;

      // --- CYOA branching flow ---
      if (flip.type === "cyoa") {
        if (state.currentCyoaNodeId === null) return state;
        const node = flip.nodes[state.currentCyoaNodeId];
        if (!node || node.isEnding) return state;
        const option = node.options?.[optionIndex];
        if (!option) return state;

        const targetNode = flip.nodes[option.goto];
        if (!targetNode) return state;

        if (targetNode.isEnding) {
          return {
            ...state,
            phase: "flip_summary",
            currentCyoaNodeId: option.goto,
            cyoaEndingType: targetNode.endingType,
            currentFlipOutcome: null,
          };
        }

        return {
          ...state,
          currentCyoaNodeId: option.goto,
          // Stay in flip_decision phase - go directly to next scene
        };
      }

      // --- Existing linear flow ---
      const decision = flip.decisions[state.currentDecisionIndex];
      if (!decision) return state;

      const option = decision.options[optionIndex];
      if (!option) return state;

      if (state.currentFlipStats === null) return state;
      const { nextStats, consequenceFlags, outcome, wasSuccess } = resolveFlipOption(
        option,
        state.currentFlipStats,
        random,
      );

      return {
        ...state,
        phase: "flip_outcome",
        currentFlipStats: nextStats,
        flipConsequenceFlags: [...state.flipConsequenceFlags, ...consequenceFlags],
        currentFlipOutcome: outcome,
        flipOutcomeWasSuccess: wasSuccess,
      };
    }

    case "CONTINUE_FLIP": {
      if (state.phase !== "flip_outcome") return state;
      if (!isFlipId(state.currentFlipId)) return state;
      const flip = ALL_FLIPS[state.currentFlipId];
      if (!flip || flip.type === 'cyoa') return state;

      const nextIndex = state.currentDecisionIndex + 1;

      if (nextIndex >= flip.decisions.length) {
        return {
          ...state,
          phase: "flip_summary",
          currentFlipOutcome: null,
        };
      }

      return {
        ...state,
        phase: "flip_decision",
        currentDecisionIndex: nextIndex,
        currentFlipOutcome: null,
      };
    }

    case "DISMISS_FLIP_SUMMARY": {
      if (state.phase !== "flip_summary") return state;

      const { currentFlipId, flipConsequenceFlags, turn, chronicle } = state;
      const flip = isFlipId(currentFlipId) ? ALL_FLIPS[currentFlipId] : null;
      // BUG-04 guard: if flip data is missing, recover to management
      if (!flip) {
        return {
          ...state,
          phase: "management",
          currentFlipId: null,
          currentFlipStats: null,
          currentDecisionIndex: 0,
          flipConsequenceFlags: [],
          currentFlipOutcome: null,
          currentCyoaNodeId: null,
          cyoaEndingType: null,
        };
      }

      // Compute consequences: CYOA uses endingType, linear uses consequence flags
      let consequences;
      if (flip.type === "cyoa") {
        consequences = computeCyoaConsequences(currentFlipId, state.cyoaEndingType);
      } else {
        consequences = computeFlipConsequences(currentFlipId, flipConsequenceFlags);
      }
      const resourceEffects = translateEffects(consequences);
      const applied = applyResourceEffects(state, resourceEffects, MAX_GARRISON);

      // Reconcile typed garrison
      const flipGarrisonDelta = applied.garrison - state.garrison;
      let flipMilitary = applied.military || state.military;
      if (flipGarrisonDelta !== 0 && flipMilitary) {
        const mg = { ...flipMilitary.garrison };
        if (flipGarrisonDelta > 0) {
          mg.levy = Math.min((mg.levy || 0) + flipGarrisonDelta, MAX_GARRISON);
          flipMilitary = { ...flipMilitary, garrison: mg };
        } else {
          flipMilitary = { ...flipMilitary, garrison: removeFromGarrison(mg, Math.abs(flipGarrisonDelta)) };
        }
      }

      // SIMULATE_SEASON owns elapsed bankruptcy seasons. A story can restore
      // solvency, but returning to management does not complete another season.
      const flipBankruptcyTurns = applied.denarii > 0 ? 0 : (state.bankruptcyTurns || 0);

      const newState = {
        ...state,
        denarii: applied.denarii,
        population: applied.population,
        garrison: applied.garrison,
        inventory: applied.inventory,
        food: applied.food,
        military: flipMilitary,
        bankruptcyTurns: flipBankruptcyTurns,
      };
      const gameOverReason = checkGameOver(newState);

      // Chronicle entry
      const { season: flipSeason, year: flipYear } = turnToSeasonYear(turn);
      const chronicleText = `You experienced life as ${flip.character} and saw your manor through their eyes.`;
      let nextChronicle = addChronicle(chronicle, chronicleText, flipSeason, flipYear, turn, "event");

      // BUG-15: Add cause chain entry for flip consequences
      const flipCauseEntry = {
        turn, season: flipSeason, year: flipYear,
        summary: `Perspective flip: ${flip.character}`,
        effects: resourceEffects,
      };
      const nextCauseChain = [...(state.causeChain || []), flipCauseEntry].slice(-MAX_CAUSE_CHAIN);

      // Mark flip as fired
      if (!isFlipId(currentFlipId)) return state;
      const nextPerspectiveFlips = { ...state.perspectiveFlips, [currentFlipId]: true };

      if (gameOverReason) {
        return {
          ...state,
          ...newState,
          phase: "game_over",
          chronicle: nextChronicle,
          causeChain: nextCauseChain,
          gameOverReason,
          perspectiveFlips: nextPerspectiveFlips,
          currentFlipId: null,
          currentFlipStats: null,
          currentDecisionIndex: 0,
          flipConsequenceFlags: [],
          currentFlipOutcome: null,
          currentCyoaNodeId: null,
          cyoaEndingType: null,
        };
      }

      // BUG-01 FIX: Do NOT increment turn — ADVANCE_TURN already did it.
      // The flip happens on the current turn, not a new one.

      // BUG-05 FIX: Victory check uses current turn (already incremented by ADVANCE_TURN)
      if (turn >= MAX_TURNS) {
        const isPyrrhic = (newState.population ?? state.population) < 3;
        const victoryText = isPyrrhic
          ? "Ten years have passed, but at what cost? Your estate barely clings to life. " +
            "The chronicles will note your survival, though few remain to read them."
          : "Ten years have passed. Your reign has endured through war, famine, and feast. " +
            "The chronicles will remember your name.";
        return {
          ...state,
          ...newState,
          phase: "victory",
          pyrrhicVictory: isPyrrhic,
          chronicle: addChronicle(nextChronicle, victoryText, flipSeason, flipYear, turn, "system"),
          causeChain: nextCauseChain,
          perspectiveFlips: nextPerspectiveFlips,
          currentFlipId: null,
          currentFlipStats: null,
          currentDecisionIndex: 0,
          flipConsequenceFlags: [],
          currentFlipOutcome: null,
          currentCyoaNodeId: null,
          cyoaEndingType: null,
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
        };
      }

      // ADVANCE_TURN already counted this completed season before the flip.
      const flipUpdatedSynergies = state.synergies ?? {};
      const flipStateForSynergyCheck = { ...newState, synergies: flipUpdatedSynergies };
      const flipNewSynergyIds = checkSynergies(flipStateForSynergyCheck);
      let flipSynergiesAfterCheck = flipUpdatedSynergies;
      const flipSynNotifications = [];
      if (flipNewSynergyIds.length > 0) {
        flipSynergiesAfterCheck = {
          ...flipUpdatedSynergies,
          activated: [...(flipUpdatedSynergies.activated ?? []), ...flipNewSynergyIds],
        };
        for (const tierId of flipNewSynergyIds) {
          const entry = SYNERGY_TIER_MAP[tierId];
          if (entry?.tier.chronicle) {
            nextChronicle = addChronicle(nextChronicle, entry.tier.chronicle, flipSeason, flipYear, turn, "event");
          }
          flipSynNotifications.push({
            tierId,
            tier: entry?.tier.tier ?? 1,
            title: entry?.tier.title ?? "",
            description: entry?.tier.description ?? "",
            pathName: entry?.path.name ?? "",
            pathIcon: entry?.path.icon ?? "",
            pathColor: entry?.path.color ?? "#b8860b",
            scribesNote: entry?.tier.scribesNote ?? null,
          });
        }
      }

      const flipBonuses = applySynergyMeterEffects(
        state.greatHall?.meters ?? { people: 50, treasury: 50, church: 50, military: 50 },
        state.chapel?.faith ?? 50, flipNewSynergyIds,
      );

      const zeroDeltas = { denarii: 0, food: 0, population: 0, garrison: 0 };

      return {
        ...state,
        ...newState,
        phase: "management",
        // BUG-01 FIX: use current turn, not turn + 1
        turn,
        season: flipSeason,
        year: flipYear,
        chronicle: nextChronicle,
        causeChain: nextCauseChain,
        perspectiveFlips: nextPerspectiveFlips,
        activeTab: "estate",
        seasonReport: [],
        resourceDeltas: zeroDeltas,
        currentEvent: null,
        currentRandomEvent: null,
        scribesNote: null,
        currentFlipId: null,
        currentFlipStats: null,
        currentDecisionIndex: 0,
        flipConsequenceFlags: [],
        currentFlipOutcome: null,
        currentCyoaNodeId: null,
        cyoaEndingType: null,
        // Seasonal work belongs to SIMULATE_SEASON and ADVANCE_TURN, not story dismissal.
        greatHall: { ...state.greatHall, meters: flipBonuses.meters },
        chapel: { ...state.chapel, faith: flipBonuses.faith },
        synergies: flipSynergiesAfterCheck,
        pendingSynergyNotifications: [...(state.deferredSynergyNotifications ?? []), ...flipSynNotifications],
        deferredSynergyNotifications: [],
      };
    }

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
    // MARTA THE MERCHANT
    // -----------------------------------------------------------------------

    case "TAVERN_MARTA_NEXT": {
      if (state.phase !== "management") return state;
      const tavern = state.tavern ?? {};
      const current = tavern.martaCurrentContent;
      if (current?.type === "offer" && current.resolution === null &&
          MARTA_OFFERS.find(offer => offer.id === current.offerId)?.canAccept(state)) return state;
      const next = nextCompanionContent(
        "marta", random, tavern.martaOffersUsed ?? [],
        tavern.martaAdviceRemaining ?? [], tavern.martaStoriesRemaining ?? [],
      );
      if (!next) return state;
      return {
        ...state,
        tavern: {
          ...tavern,
          martaCurrentContent: next.content,
          martaAdviceRemaining: next.adviceRemaining,
          martaStoriesRemaining: next.storiesRemaining,
        },
      };
    }

    case "TAVERN_MARTA_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        tavern: { ...state.tavern, martaScribesNoteSeen: true },
      };
    }

    case "TAVERN_MARTA_ACCEPT_OFFER": {
      if (state.phase !== "management") return state;
      const { offerId } = action.payload ?? {};
      const prevTm = state.tavern ?? {};
      const current = prevTm.martaCurrentContent;
      if (!isCompanionContent("marta", current) || current?.type !== "offer" ||
          current.offerId !== offerId || current.resolution !== null) return state;
      if ((prevTm.martaOffersUsed ?? []).includes(offerId)) return state;

      const baseTavern: GameSnapshot['tavern'] = {
        ...prevTm,
        martaOffersUsed: [...(prevTm.martaOffersUsed ?? []), offerId],
        martaCurrentContent: { ...current, resolution: "accepted" },
      };

      switch (offerId) {
        case "bulk_wool": {
          if ((state.inventory?.wool ?? 0) < 5) return state;
          const newInv = { ...state.inventory, wool: state.inventory.wool - 5 };
          return {
            ...state,
            denarii: state.denarii + 40,
            inventory: newInv,
            food: getTotalFood(newInv),
            tavern: baseTavern,
            chronicle: addChronicle(state.chronicle, "Marta brokered a Flemish wool deal: sold 5 wool for 40d.", state.season, state.year, state.turn, "action"),
          };
        }
        case "spice_investment": {
          if (state.denarii < 75) return state;
          return {
            ...state,
            denarii: state.denarii - 75,
            tavern: { ...baseTavern, martaSpiceInvestment: true },
            chronicle: addChronicle(state.chronicle, "Invested 75d in Marta\u2019s spice shipment. Returns expected next season.", state.season, state.year, state.turn, "action"),
          };
        }
        case "trade_route_tip": {
          if (state.denarii < 30) return state;
          // Find best-priced trade good
          const tradeGoods = ["wool", "cloth", "honey", "herbs", "ale"] as const;
          let bestGood = "cloth";
          let bestPrice = 0;
          for (const good of tradeGoods) {
            const price = state.marketPrices?.sell?.[good] ?? 0;
            if (price > bestPrice) {
              bestPrice = price;
              bestGood = good;
            }
          }
          const tipText = `Marta whispers: "${bestGood.charAt(0).toUpperCase() + bestGood.slice(1)} fetches ${bestPrice}d at market right now. Best rate I\u2019ve seen."`;
          return {
            ...state,
            denarii: state.denarii - 30,
            tavern: baseTavern,
            chronicle: addChronicle(state.chronicle, tipText, state.season, state.year, state.turn, "action"),
          };
        }
        case "storage_deal": {
          if (state.denarii < 50) return state;
          if (prevTm.martaStoragePurchased) return state;
          return {
            ...state,
            denarii: state.denarii - 50,
            inventoryCapacity: (state.inventoryCapacity ?? 300) + 20,
            tavern: { ...baseTavern, martaStoragePurchased: true },
            chronicle: addChronicle(state.chronicle, "Marta arranged storage expansion. Inventory capacity +20.", state.season, state.year, state.turn, "action"),
          };
        }
        default:
          return state;
      }
    }

    case "TAVERN_MARTA_DECLINE_OFFER": {
      if (state.phase !== "management") return state;
      const { offerId: declinedMartaId } = action.payload ?? {};
      const prevTmd = state.tavern ?? {};
      const current = prevTmd.martaCurrentContent;
      if (!isCompanionContent("marta", current) || current?.type !== "offer" ||
          current.offerId !== declinedMartaId || current.resolution !== null) return state;
      if ((prevTmd.martaOffersUsed ?? []).includes(declinedMartaId)) return state;
      return {
        ...state,
        tavern: {
          ...prevTmd,
          martaOffersUsed: [...(prevTmd.martaOffersUsed ?? []), declinedMartaId],
          martaCurrentContent: { ...current, resolution: "declined" },
        },
        chronicle: addChronicle(state.chronicle, "You declined Marta\u2019s trade offer.", state.season, state.year, state.turn, "action"),
      };
    }

    // -----------------------------------------------------------------------
    // OLD ALDRIC THE VETERAN
    // -----------------------------------------------------------------------

    case "TAVERN_ALDRIC_NEXT": {
      if (state.phase !== "management") return state;
      const tavern = state.tavern ?? {};
      const current = tavern.aldricCurrentContent;
      if (current?.type === "offer" && current.resolution === null &&
          ALDRIC_TRAINING_OFFERS.find(offer => offer.id === current.offerId)?.canAccept(state)) return state;
      const next = nextCompanionContent(
        "aldric", random, tavern.aldricOffersUsed ?? [],
        tavern.aldricAdviceRemaining ?? [], tavern.aldricStoriesRemaining ?? [],
      );
      if (!next) return state;
      return {
        ...state,
        tavern: {
          ...tavern,
          aldricCurrentContent: next.content,
          aldricAdviceRemaining: next.adviceRemaining,
          aldricStoriesRemaining: next.storiesRemaining,
        },
      };
    }

    case "TAVERN_ALDRIC_SCRIBES_NOTE_SEEN": {
      return {
        ...state,
        tavern: { ...state.tavern, aldricScribesNoteSeen: true },
      };
    }

    case "TAVERN_ALDRIC_ACCEPT_OFFER": {
      if (state.phase !== "management") return state;
      const { offerId: aldricOfferId } = action.payload ?? {};
      const prevTa2 = state.tavern ?? {};
      const current = prevTa2.aldricCurrentContent;
      if (!isCompanionContent("aldric", current) || current?.type !== "offer" ||
          current.offerId !== aldricOfferId || current.resolution !== null) return state;
      if ((prevTa2.aldricOffersUsed ?? []).includes(aldricOfferId)) return state;

      const baseAldricTavern: GameSnapshot['tavern'] = {
        ...prevTa2,
        aldricOffersUsed: [...(prevTa2.aldricOffersUsed ?? []), aldricOfferId],
        aldricCurrentContent: { ...current, resolution: "accepted" },
      };

      switch (aldricOfferId) {
        case "basic_drill": {
          if (state.denarii < 30 || (state.garrison ?? 0) === 0) return state;
          return {
            ...state,
            denarii: state.denarii - 30,
            tavern: { ...baseAldricTavern, aldricDrillActive: 3 },
            chronicle: addChronicle(state.chronicle, "Old Aldric drilled the garrison. Defense readiness improved for 3 seasons.", state.season, state.year, state.turn, "action"),
          };
        }
        case "wall_inspection": {
          if (state.denarii < 20) return state;
          const garrison = state.garrison ?? 0;
          const castleLvl = state.castleLevel ?? 1;
          const defCount = (state.defenseUpgrades ?? []).length;
          let report;
          if (castleLvl === 1 && garrison < 5) {
            report = "Aldric\u2019s report: Your defenses are dire. A wooden palisade and fewer than 5 men? Upgrade your castle and recruit immediately.";
          } else if (castleLvl < 3 && defCount === 0) {
            report = "Aldric\u2019s report: Stone walls would serve you better, and you\u2019ve no defensive installations. Consider a moat or arrow slits.";
          } else if (garrison < 8) {
            report = "Aldric\u2019s report: Your walls are adequate, but you need more men. A castle without soldiers is just an expensive barn.";
          } else {
            report = "Aldric\u2019s report: Your defenses are sound. Maintain garrison strength and upgrade when resources allow.";
          }
          return {
            ...state,
            denarii: state.denarii - 20,
            tavern: baseAldricTavern,
            chronicle: addChronicle(state.chronicle, report, state.season, state.year, state.turn, "action"),
          };
        }
        case "recruit_referral": {
          if (state.denarii < 40 || getRecruitmentCapacity(state, "menAtArms") < 1) return state;
          const refMil = state.military ?? getInitialMilitaryState(state.garrison ?? 0);
          const refGarrison = { ...refMil.garrison, menAtArms: (refMil.garrison.menAtArms || 0) + 1 };
          return {
            ...state,
            denarii: state.denarii - 40,
            garrison: getTotalGarrison(refGarrison),
            military: { ...refMil, garrison: refGarrison },
            tavern: baseAldricTavern,
            chronicle: addChronicle(state.chronicle, "Aldric recruited a seasoned man-at-arms for the garrison.", state.season, state.year, state.turn, "action"),
          };
        }
        case "war_story_lesson": {
          if ((state.garrison ?? 0) === 0) return state;
          return {
            ...state,
            population: state.population + 2,
            tavern: baseAldricTavern,
            chronicle: addChronicle(state.chronicle, "Aldric told war stories to the garrison. Morale spread through the village. Population +2.", state.season, state.year, state.turn, "action"),
          };
        }
        default:
          return state;
      }
    }

    case "TAVERN_ALDRIC_DECLINE_OFFER": {
      if (state.phase !== "management") return state;
      const { offerId: declinedAldricId } = action.payload ?? {};
      const prevTad = state.tavern ?? {};
      const current = prevTad.aldricCurrentContent;
      if (!isCompanionContent("aldric", current) || current?.type !== "offer" ||
          current.offerId !== declinedAldricId || current.resolution !== null) return state;
      if ((prevTad.aldricOffersUsed ?? []).includes(declinedAldricId)) return state;
      return {
        ...state,
        tavern: {
          ...prevTad,
          aldricOffersUsed: [...(prevTad.aldricOffersUsed ?? []), declinedAldricId],
          aldricCurrentContent: { ...current, resolution: "declined" },
        },
        chronicle: addChronicle(state.chronicle, "You declined Aldric\u2019s offer.", state.season, state.year, state.turn, "action"),
      };
    }

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
      const newCompoundFlags = computeCompoundFlags(newHistory);
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
