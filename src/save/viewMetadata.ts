import { FLIP_STAT_IDS, type FlipStats, type FlipEnding } from '../data/flipTypes.ts';
import { ALL_FLIPS, type FlipId } from '../engine/flipEngine.ts';
import { SEASON_INFO } from '../data/economy.ts';
import { SYNERGY_TIER_MAP } from '../data/synergies.ts';
import type { CauseChainEntry, EconomyHistoryEntry, ResourceDeltas, SynergyNotification } from '../engine/initialGameStateTypes.ts';

/** Consumed top-level metadata; legacy names and unknown unconsumed extensions remain intact. */
export interface ViewMetadata {
  inventoryCapacity: number; totalPlots: number;
  castleUpgradeProgress: number; castleUpgrading: boolean; churchDonation: number;
  bankruptcyTurns: number; starvationTurns: number; tradeCount: number; lastFlipTurn: number;
  militaryEventEverFired: boolean; currentDecisionIndex: number;
  tutorialsSeen: string[]; defenseUpgrades: string[]; seasonReport: string[];
  usedSeasonalIds: string[]; usedRandomIds: string[]; flipConsequenceFlags: string[];
  economyHistory: EconomyHistoryEntry[]; causeChain: CauseChainEntry[];
  resourceDeltas: Partial<ResourceDeltas>;
  laborAllocation: Partial<{ demesne: number; peasant: number; construction: number }>;
  perspectiveFlips: Partial<Record<FlipId, boolean>>;
  pendingSynergyNotifications: SynergyNotification[];
  deferredSynergyNotifications?: SynergyNotification[] | null;
  scribesNote: string | null; currentFlipId: string | null;
  currentFlipStats: FlipStats | null; currentFlipOutcome: string | null;
  currentCyoaNodeId: string | null; cyoaEndingType: FlipEnding | null;
  flipOutcomeWasSuccess?: boolean | null;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function season(value: unknown): boolean { return typeof value === 'string' && Object.hasOwn(SEASON_INFO, value); }
function dense(value: unknown, valid: (entry: unknown) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || !valid(value[index])) return false;
  return true;
}
function notification(value: unknown): boolean {
  if (!record(value) || typeof value.tierId !== 'string' || !Object.hasOwn(SYNERGY_TIER_MAP, value.tierId) ||
      (value.tier !== 1 && value.tier !== 2 && value.tier !== 3)) return false;
  for (const key of ['title', 'description', 'pathName', 'pathIcon', 'pathColor']) if (typeof value[key] !== 'string') return false;
  return value.scribesNote == null || typeof value.scribesNote === 'string';
}
/** Called after existing required numeric/boolean/list/record checks, without rewriting data. */
export function validateViewMetadata(state: Record<string, unknown>): string | null {
  for (const key of ['tutorialsSeen', 'defenseUpgrades', 'seasonReport', 'usedSeasonalIds', 'usedRandomIds', 'flipConsequenceFlags']) {
    if (!dense(state[key], value => typeof value === 'string')) return `Save ${key} entries must be text.`;
  }
  if (!dense(state.causeChain, entry => record(entry) && finite(entry.turn) && season(entry.season) && finite(entry.year) && typeof entry.summary === 'string')) {
    return 'Save cause-chain entries are invalid.';
  }
  if (!dense(state.economyHistory, entry => record(entry) && finite(entry.turn) && season(entry.season) && finite(entry.netGold) && finite(entry.netFood))) {
    return 'Save economy history entries are invalid.';
  }
  if (!dense(state.pendingSynergyNotifications, notification)) return 'Save pending synergy notifications are invalid.';
  if (state.deferredSynergyNotifications != null && !dense(state.deferredSynergyNotifications, notification)) return 'Save deferred synergy notifications are invalid.';
  for (const [key, fields] of [
    ['resourceDeltas', ['denarii', 'food', 'population', 'garrison']],
    ['laborAllocation', ['demesne', 'peasant', 'construction']],
  ] as const) {
    const values = state[key]; if (!record(values)) return `Save ${key} is invalid.`;
    for (const field of fields) if (values[field] !== undefined && !finite(values[field])) return `Save ${key}.${field} must be a finite number.`;
  }
  const completed = state.perspectiveFlips;
  if (!record(completed)) return 'Save perspective completion flags are invalid.';
  for (const id of Object.keys(ALL_FLIPS)) if (completed[id] !== undefined && typeof completed[id] !== 'boolean') return `Save perspective completion ${id} must be true or false.`;
  for (const key of ['scribesNote', 'currentFlipId', 'currentFlipOutcome', 'currentCyoaNodeId']) {
    if (state[key] !== null && typeof state[key] !== 'string') return `Save ${key} must be text or null.`;
  }
  if (state.cyoaEndingType !== null && state.cyoaEndingType !== 'good' && state.cyoaEndingType !== 'medium' && state.cyoaEndingType !== 'bad') return 'Save perspective ending tag is invalid.';
  if (state.flipOutcomeWasSuccess !== undefined && state.flipOutcomeWasSuccess !== null && typeof state.flipOutcomeWasSuccess !== 'boolean') return 'Save perspective outcome success must be true, false or null.';
  const stats = state.currentFlipStats;
  if (stats !== null) {
    if (!record(stats)) return 'Save perspective stats must be an object or null.';
    for (const id of FLIP_STAT_IDS) if (stats[id] !== undefined && !finite(stats[id])) return `Save perspective stat ${id} must be a finite number.`;
  }
  const loss = state.gameOverReason;
  if (loss !== null && (!record(loss) || (loss.type !== 'depopulation' && loss.type !== 'bankruptcy' && loss.type !== 'famine') || typeof loss.reason !== 'string' || loss.reason.trim() === '')) {
    return 'Save game-over reason is missing or invalid.';
  }
  return null;
}
