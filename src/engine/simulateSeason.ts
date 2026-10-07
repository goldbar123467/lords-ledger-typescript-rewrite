import type {GameSnapshot, Season} from '../save/saveGame.ts';
import type {EventPools} from './gameCommands.ts';
import type {SeasonalEvent} from '../data/eventTypes.ts';
import {selectSeasonalEvent, type RandomSource} from './eventSelector.ts';
import {MAX_TURNS, turnToSeasonYear} from './gameCalendar.ts';
import {simulateEconomy, getBuildingType} from './economyEngine.ts';
import {getInitialMilitaryState, getTotalGarrison, removeFromGarrison, getMilitaryUpkeep, getMoraleLevel, KNIGHT_NAMES} from '../data/military.ts';
import {addChronicle} from './chronicle.ts';
import {getConditionAfterSeason} from './buildingWear.ts';
import BUILDINGS from '../data/buildings.ts';
import {advancePeopleSeason} from './advancePeopleSeason.ts';
import {checkGameOver} from './meterUtils.ts';
import {computeResourceDeltas} from './eventChoice.ts';
import {pickMarketEvent} from '../data/market.ts';
import {generateForgeMarketPrices, rollForgeSupplyEvent} from '../data/blacksmith.ts';
import {getForgeSupplyStatus} from './forgeAncillaryActions.ts';
import {getInitialRaidState, checkForRaid} from './raidEngine.ts';
import {getMilitaryReadiness} from './militaryReadiness.ts';

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

/** Process one season atomically; the reducer owns the saved random cursor. */
export function simulateSeason(state: GameSnapshot, action: Readonly<{payload?: EventPools}>, random: RandomSource): GameSnapshot {
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
  const economicPatch = {
    denarii: econResult.denarii,
    food: econResult.food,
    population: econResult.population,
    garrison: econResult.garrison,
    inventory: econResult.inventory,
    buildings: degradedBuildings,
    economyHistory: newEconomyHistory,
    chronicle: nextChronicle,
    seasonReport: econResult.report,
    resourceDeltas: computeResourceDeltas(before, econResult),
    bankruptcyTurns,
    starvationTurns,
  };
  if (econGameOver) {
    return {
      ...state,
      ...economicPatch,
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

  const completedSeason: GameSnapshot = {
    ...state,
    ...economicPatch,
    denarii: finalDenarii,
    inventory: econResult.inventory,
    chronicle: nextChronicle,
    resourceDeltas: computeResourceDeltas(before, {
      denarii: finalDenarii,
      food: econResult.food,
      population: econResult.population,
      garrison: econResult.garrison,
    }),
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

  if (raidTrigger) {
    // Capture readiness before the seasonal drill counter expires. A raid in
    // the third covered season still benefits even though the next turn does not.
    const { drillBonus, baseDefense: defenseRating } = getMilitaryReadiness({
      ...state, military: updatedMilitary, garrison: econResult.garrison,
      blacksmith: forgeSeasonReset,
    });
    // Raid triggered — pause season at raid_warning phase
    return {
      ...completedSeason,
      phase: "raid_warning",
      currentEvent: seasonalEvent,
      raids: {
        ...raidsWithCooldowns,
        activeRaid: { type: raidTrigger.type, phase: "warning", result: null, drillBonus, defenseRating },
      },
    };
  }

  return completedSeason;
}
