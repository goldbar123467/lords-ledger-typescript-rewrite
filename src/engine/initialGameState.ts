/** Seeded modern game construction. Persistence compatibility is validated separately. */
import { createRandomCursor, DEFAULT_SEED } from './random.ts';
import { EMPTY_INVENTORY, generateMarketPrices, STARTING_TOTAL_PLOTS } from '../data/economy.ts';
import { getInitialMilitaryState } from '../data/military.ts';
import { getInitialPeopleState } from '../data/people.ts';
import { getInitialRaidState } from './raidEngine.ts';
import type { InitialGameState } from './initialGameStateTypes.ts';

export function createInitialState(seed: number = DEFAULT_SEED): InitialGameState {
  const cursor = createRandomCursor(seed);
  const marketPrices = generateMarketPrices(cursor.next);
  return {
  rngState: cursor.state,
  phase: "title",
  difficulty: "normal",
  turn: 1,
  season: "spring",
  year: 1,

  // Resources (replaces abstract meters)
  denarii: 500,
  food: 200,
  population: 20,
  inventory: { ...EMPTY_INVENTORY, grain: 150, livestock: 30, fish: 20, iron: 20, steel: 5, coal: 50, leather: 10, wood: 15 },
  inventoryCapacity: 300,
  buildings: [
    { instanceId: "strip_farm-0-pre", type: "strip_farm", condition: 100, builtOnTurn: 0, freeUpkeep: true },
    { instanceId: "pasture-0-pre", type: "pasture", condition: 100, builtOnTurn: 0, freeUpkeep: true },
    { instanceId: "coal_pit-0-pre", type: "coal_pit", condition: 100, builtOnTurn: 0, freeUpkeep: true },
    { instanceId: "tannery-0-pre", type: "tannery", condition: 100, builtOnTurn: 0, freeUpkeep: true },
    { instanceId: "sawmill-0-pre", type: "sawmill", condition: 100, builtOnTurn: 0, freeUpkeep: true },
    { instanceId: "smelter-0-pre", type: "smelter", condition: 100, builtOnTurn: 0, freeUpkeep: true },
  ],
  totalPlots: STARTING_TOTAL_PLOTS,
  economyHistory: [],      // Array of { turn, season, netGold, netFood } for trend display
  garrison: 5,
  castleLevel: 1,
  castleUpgradeProgress: 0,
  castleUpgrading: false,
  taxRate: "medium",
  laborAllocation: { demesne: 40, peasant: 40, construction: 20 },
  marketPrices,
  defenseUpgrades: [],
  churchDonation: 0,

  // Resource deltas (for dashboard display)
  resourceDeltas: { denarii: 0, food: 0, population: 0, garrison: 0 },

  // Bankruptcy tracking (6 consecutive turns at 0 denarii = game over)
  bankruptcyTurns: 0,
  // Starvation tracking (3 consecutive turns at 0 food = game over)
  starvationTurns: 0,

  // UI state
  activeTab: "estate",
  tutorialsSeen: [],
  seasonReport: [],

  // Event system
  chronicle: [],
  currentEvent: null,
  currentRandomEvent: null,
  scribesNote: null,
  usedSeasonalIds: [],
  usedRandomIds: [],
  causeChain: [],
  gameOverReason: null,

  // Perspective flip state
  perspectiveFlips: {
    serf_week: false, merchant_day: false, noble_dilemma: false, knight_gamble: false,
    cyoa_lord: false, cyoa_merchant: false, cyoa_monk: false, cyoa_knight: false, cyoa_serf: false,
  },
  tradeCount: 0,
  militaryEventEverFired: false,
  lastFlipTurn: 0,
  currentFlipId: null,
  currentFlipStats: null,
  currentDecisionIndex: 0,
  flipConsequenceFlags: [],
  currentFlipOutcome: null,
  currentCyoaNodeId: null,
  cyoaEndingType: null,

  // Synergy system state (simplified — no meter-based tracking)
  synergies: {
    activated: [],
    tradeTypes: [],
    woolTrades: 0,
    spicePurchases: 0,
    lowTaxTurns: 0,
    foodSurplusTurns: 0,
    highFaithTurns: 0,
    highPeopleTurns: 0,
  },
  pendingSynergyNotifications: [],

  // Raid system state
  raids: getInitialRaidState(),

  // Watchtower state
  watchtower: {
    scannedThisSeason: false,
    lastScanResult: null,
    warnings: {
      criminalRaidBonus: 0,
      scottishRaidBonus: 0,
      raidRequirementReduction: 0,
      merchantPreview: null,
    },
    totalScans: 0,
    totalAnomaliesSpotted: 0,
    totalAnomaliesMissed: 0,
    perfectScans: 0,
    signalLog: [],
    rodericScribesNoteSeen: false,
    scanScribesNoteSeen: false,
  },

  // Tavern state
  tavern: {
    gambitRoundsThisSeason: 0,
    gambitLastChoice: null,
    gambitTotalWins: 0,
    gambitTotalLosses: 0,
    gambitNetEarnings: 0,
    ratsPlayedThisSeason: false,
    ratsBestScore: 0,
    bardRiddlesSolved: 0,
    bardSolvedRiddleIds: [],
    bardCurrentContent: null,
    bardTalesRemaining: [],
    bardTalesServed: 0,
    wallStashFound: false,
    strangerAppearedThisSeason: false,
    pendingStrangerEncounter: null,
    totalVisits: 0,
    gambitScribesNoteSeen: false,
    ratsScribesNoteSeen: false,
    // Marta the Merchant
    martaOffersUsed: [],
    martaCurrentContent: null,
    martaAdviceRemaining: [],
    martaStoriesRemaining: [],
    martaSpiceInvestment: false,
    martaStoragePurchased: false,
    martaScribesNoteSeen: false,
    // Old Aldric
    aldricOffersUsed: [],
    aldricCurrentContent: null,
    aldricAdviceRemaining: [],
    aldricStoriesRemaining: [],
    aldricDrillActive: 0,
    aldricScribesNoteSeen: false,
  },

  // Chapel state
  chapel: {
    view: "nave",
    faith: 50,
    piety: 30,
    happiness: 60,
    anselmGreeting: null,
    caedmonGreeting: null,
    currentDilemma: null,
    dilemmaResult: null,
    dilemmasCompleted: [],
    inventory: [],
    titheAmount: 0,
    titheResponse: null,
    msPhase: "idle",
    msPattern: [],
    msPlayerInput: [],
    msRound: 1,
    msMaxRound: 4,
    msActiveSymbol: null,
    msFact: null,
    msReward: 0,
    gameLog: [],
    // B-14 FIX: Per-year counter for diminishing returns on spice-driven faith gain.
    spicePurchasesThisYear: 0,
  },

  // Market Square state
  market: {
    reputation: {
      edmund: 50,
      wulfric: 50,
      agnes: 50,
      foreign: 50,
    },
    activeHaggle: null,
    currentForeignTrader: "spring",
    tradesThisSeason: 0,
    totalTradesLifetime: 0,
    totalHagglesWon: 0,
    totalHagglesLost: 0,
    denariiEarnedFromTrade: 0,
    denariiSpentOnTrade: 0,
    seasonalPriceModifiers: {},
    activeMarketEvent: null,
    usedMarketEventIds: [],
    quickTradesUsed: 0,
    haggleTradesUsed: 0,
    lastTradedSeason: { edmund: -1, wulfric: -1, agnes: -1, foreign: -1 },
    marketScribesNoteSeen: false,
    reputationScribesNoteSeen: false,
  },

  // Great Hall state (approval meters, reputation, ruling history, audience, decrees, council, feast)
  greatHall: {
    meters: { people: 50, treasury: 50, church: 50, military: 50 },
    reputation: "Unknown Lord",
    reputationTrack: null,
    reputationScores: {},
    disputesResolved: 0,
    rulingHistory: [],
    // Phase 3: Audience, Decrees, Council, Feast
    audienceResolved: [],
    activeDecrees: [],
    decreeSlotsUsed: 0,
    councilResolved: [],
    hasFeastedThisSeason: false,
    feastHistory: [],
    // Phase 4: Steward trust
    stewardTrust: 50,
    // Phase 5: Consequence engine
    hallLog: [],
    meterHistory: [],
    compoundFlags: {},
    pendingHallEvent: null,
    crisisTriggered: {},
    peakTriggered: {},
  },

  // Military state (typed garrison, fortification tracks, morale)
  military: getInitialMilitaryState(5),

  // People tab state (social tiers, labor allocation, notable families, village feed)
  people: getInitialPeopleState(20),

  // Blacksmith Forge state
  blacksmith: {
    inventory: [],
    equipped: [],
    nextItemUid: 1,
    totalItemsForged: 0,
    masterworksCreated: 0,
    godricRespect: 50,
    godricMood: "working",
    watFactIndex: 0,
    banterIndex: 0,
    lastVisitTurn: 0,
    marketPrices: null,
    productionLog: [],
    priceHistory: [],
    totalGoldInvested: 0,
    totalGoldEarned: 0,
    salesThisSeason: 0,
    activeSupplyEvent: null,
    supplyEventTurnsLeft: 0,
    usedSupplyEventIds: [],
    soldToMortimer: false,
    ironVeinActive: false,
  },
  };
}
