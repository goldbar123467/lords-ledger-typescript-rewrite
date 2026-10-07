import type { ALL_RESOURCES } from '../data/economy.ts';
import type { RaidResult, RaidType } from '../engine/raidEngine.ts';

export const RAID_COUNTER_KEYS = ['lastRaidTurn', 'criminalCooldown', 'scottishCooldown',
  'totalCriminalRaids', 'totalScottishRaids', 'criminalVictories', 'scottishVictories',
  'criminalDefeats', 'scottishDefeats', 'totalDenariiLost', 'totalFoodLost', 'totalDenariiRecovered'] as const;
export interface SavedRaidResult extends Omit<RaidResult, 'tradeGoodLost'> {
  tradeGoodLost: { resource: typeof ALL_RESOURCES[number]; amount: number } | null;
}
interface CapturedRaidDefense {
  defenseRating?: number; drillBonus?: number;
  defenseThreshold?: number | null; watchtowerBonus?: number | null;
}
export type SavedActiveRaid = CapturedRaidDefense & (
  { type: RaidType; phase: 'warning'; result?: null } |
  { type: RaidType; phase: 'result'; result: SavedRaidResult }
);
/** Older missing/null bookkeeping keeps the existing zero/default interpretation. */
export interface SavedRaidState extends Partial<Record<typeof RAID_COUNTER_KEYS[number], number | null>> {
  lastRaidType?: RaidType | null;
  criminalScribesNoteSeen?: boolean | null; scottishScribesNoteSeen?: boolean | null;
  activeRaid?: SavedActiveRaid | null;
}
export function validateRaidBookkeeping(raids: Record<string, unknown>): string | null {
  for (const key of RAID_COUNTER_KEYS) {
    const value = raids[key];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) return `Save raid ${key} must be a finite number or null.`;
  }
  for (const key of ['criminalScribesNoteSeen', 'scottishScribesNoteSeen']) {
    if (raids[key] != null && typeof raids[key] !== 'boolean') return `Save raid ${key} must be true, false or null.`;
  }
  if (raids.lastRaidType != null && raids.lastRaidType !== 'criminal' && raids.lastRaidType !== 'scottish') return 'Save raid lastRaidType is invalid.';
  return null;
}
