import type { GameSnapshot, Season } from '../save/saveGame.ts';
import type { GeneratedMarketPrices, ResourceId, DEFENSE_UPGRADES } from '../data/economy.ts';
import type { TabId } from '../data/tabs.ts';
import type { BardRiddleId, MartaOfferId, AldricOfferId } from '../data/tavern.ts';
import type { EventDefinition } from '../data/eventTypes.ts';
import type { FlipEnding, FlipStats } from '../data/flipTypes.ts';
import type { FlipId } from './flipEngine.ts';
import type { PeopleState } from '../data/people.ts';
import type { MilitaryState } from '../data/military.ts';
import type { ScanWarnings } from './watchtowerScan.ts';
import type { RaidState } from './raidEngine.ts';
import type { SynergyTierId } from '../data/synergies.ts';
import type { MarketEvent } from '../data/market.ts';
import type { ActiveHaggle } from './marketHaggle.ts';
import type { SavedWatchtowerState } from '../save/savedWatchtower.ts';
import type { ChapelSaveState } from './chapelState.ts';
import type { ForgeSaveState } from './forgeState.ts';
import type { HallSaveState } from './hallAudienceState.ts';

export interface CauseChainEntry {
  turn: number; season: Season; year: number; summary: string;
}
export interface EconomyHistoryEntry {
  turn: number; season: Season; netGold: number; netFood: number;
}
export interface ResourceDeltas {
  denarii: number; food: number; population: number; garrison: number;
}
export interface SynergyNotification {
  tierId: SynergyTierId; tier: 1 | 2 | 3; title: string; description: string;
  pathName: string; pathIcon: string; pathColor: string; scribesNote?: string | null;
}
export interface InitialWatchtowerState extends SavedWatchtowerState {
  scannedThisSeason: boolean;
  lastScanResult: { anomaliesTotal: number; anomaliesFound: number; rating: string } | null;
  warnings: ScanWarnings;
  totalScans: number; totalAnomaliesSpotted: number; totalAnomaliesMissed: number; perfectScans: number;
  signalLog: Array<{ turn: number; season: Season; year: number; text: string; type: 'scan' }>;
  rodericScribesNoteSeen: boolean; scanScribesNoteSeen: boolean;
}
export type InitialTavernState = Omit<Required<GameSnapshot['tavern']>, 'bardSolvedRiddleIds' | 'martaOffersUsed' | 'aldricOffersUsed'> & {
  bardSolvedRiddleIds: BardRiddleId[]; martaOffersUsed: MartaOfferId[]; aldricOffersUsed: AldricOfferId[];
  ratsBestScore: number; martaSpiceInvestment: boolean; aldricDrillActive: number;
};
type ReputationOwner = 'edmund' | 'wulfric' | 'agnes' | 'foreign';
export interface InitialMarketState {
  reputation: Record<ReputationOwner, number>;
  activeHaggle: ActiveHaggle | null;
  currentForeignTrader: Season;
  tradesThisSeason: number; totalTradesLifetime: number; totalHagglesWon: number; totalHagglesLost: number;
  denariiEarnedFromTrade: number; denariiSpentOnTrade: number;
  seasonalPriceModifiers: Partial<Record<ResourceId, number>>;
  activeMarketEvent: MarketEvent | null; usedMarketEventIds: string[];
  quickTradesUsed: number; haggleTradesUsed: number;
  lastTradedSeason: Record<ReputationOwner, number>;
  marketScribesNoteSeen: boolean; reputationScribesNoteSeen: boolean;
}
/** Modern defaults require presence and nonnull values except intentional empty selections. */
type InitialFields<T, Nullable extends keyof T> = {
  [K in keyof Required<T>]: K extends Nullable ? Required<T>[K] : NonNullable<T[K]>;
};
type InitialHallState = InitialFields<HallSaveState, 'reputationTrack' | 'pendingHallEvent'>;
type InitialChapelState = InitialFields<ChapelSaveState,
  'anselmGreeting' | 'caedmonGreeting' | 'currentDilemma' | 'dilemmaResult' | 'titheResponse' | 'msActiveSymbol' | 'msFact'>;
type InitialForgeState = InitialFields<ForgeSaveState, 'marketPrices' | 'activeSupplyEvent'>;

/** Complete modern constructor shape, not a claim that older loaded snapshots contain every field. */
export interface InitialGameState extends GameSnapshot {
  synergies: GameSnapshot['synergies'] & { lowTaxTurns: number; foodSurplusTurns: number; highFaithTurns: number; highPeopleTurns: number };
  activeTab: TabId;
  inventoryCapacity: number; totalPlots: number;
  economyHistory: EconomyHistoryEntry[];
  castleUpgradeProgress: number; castleUpgrading: boolean;
  laborAllocation: { demesne: number; peasant: number; construction: number };
  marketPrices: GeneratedMarketPrices;
  defenseUpgrades: Array<keyof typeof DEFENSE_UPGRADES>; churchDonation: number;
  resourceDeltas: ResourceDeltas;
  bankruptcyTurns: number; starvationTurns: number;
  tutorialsSeen: TabId[]; seasonReport: string[];
  currentEvent: EventDefinition | null; currentRandomEvent: EventDefinition | null; scribesNote: string | null;
  usedSeasonalIds: string[]; usedRandomIds: string[]; causeChain: CauseChainEntry[];
  perspectiveFlips: Record<FlipId, boolean>;
  tradeCount: number; militaryEventEverFired: boolean; lastFlipTurn: number;
  currentFlipId: FlipId | null; currentFlipStats: FlipStats | null; currentDecisionIndex: number;
  flipConsequenceFlags: string[]; currentFlipOutcome: string | null;
  currentCyoaNodeId: string | null; cyoaEndingType: FlipEnding | null;
  pendingSynergyNotifications: SynergyNotification[];
  raids: RaidState; watchtower: InitialWatchtowerState;
  tavern: InitialTavernState; chapel: InitialChapelState;
  market: InitialMarketState; greatHall: InitialHallState;
  military: MilitaryState; people: PeopleState; blacksmith: InitialForgeState;
}
