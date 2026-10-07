import type { MarketMerchantId } from '../data/market.ts';
import type { ActiveHaggle } from '../engine/marketHaggle.ts';
import type { MarketSupply } from '../engine/marketSupply.ts';

export const MARKET_COUNTER_KEYS = ['tradesThisSeason', 'totalTradesLifetime', 'totalHagglesWon',
  'totalHagglesLost', 'denariiEarnedFromTrade', 'denariiSpentOnTrade', 'quickTradesUsed', 'haggleTradesUsed'] as const;

/** Loaded banners need their consumed text and rule, not modern generation metadata. */
export interface SavedMarketEvent {
  title?: string | null; description?: string | null; bannerColor?: string | null;
  effect?: { noHaggling?: boolean | null } | null;
}
/** Missing/null bookkeeping preserves the reducer's existing zero/default behavior. */
export interface SavedMarketState extends Partial<Record<typeof MARKET_COUNTER_KEYS[number], number | null>> {
  reputation: Partial<Record<MarketMerchantId | 'foreign', number>>;
  supply?: MarketSupply;
  activeHaggle?: ActiveHaggle | null;
  activeMarketEvent?: SavedMarketEvent | null;
  usedMarketEventIds?: string[] | null;
  marketScribesNoteSeen?: boolean | null; reputationScribesNoteSeen?: boolean | null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Prices, reputation, supply and pending terms are checked by their domain guards. */
export function validateMarketMetadata(market: Record<string, unknown>): string | null {
  for (const key of MARKET_COUNTER_KEYS) {
    const value = market[key];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) return `Save market ${key} must be a finite number or null.`;
  }
  for (const key of ['marketScribesNoteSeen', 'reputationScribesNoteSeen']) {
    if (market[key] != null && typeof market[key] !== 'boolean') return `Save market ${key} must be true, false or null.`;
  }
  const ids = market.usedMarketEventIds;
  if (ids != null && (!Array.isArray(ids) || Array.from(ids).some(id => typeof id !== 'string'))) return 'Save market usedMarketEventIds must be a dense text list or null.';
  const event = market.activeMarketEvent;
  if (event == null) return null;
  if (!isRecord(event)) return 'Save market activeMarketEvent is invalid.';
  for (const key of ['title', 'description', 'bannerColor']) {
    if (event[key] != null && typeof event[key] !== 'string') return `Save market event ${key} must be text or null.`;
  }
  const effect = event.effect;
  if (effect != null && (!isRecord(effect) || (effect.noHaggling != null && typeof effect.noHaggling !== 'boolean'))) return 'Save market event effect.noHaggling must be true, false or null.';
  return null;
}
