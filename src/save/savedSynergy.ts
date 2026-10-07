import type { SynergyTierId } from '../data/synergies.ts';
import { isTavernLedgerInteger as isExactInteger, type TavernLedgerInteger as ExactInteger } from '../engine/tavernLedger.ts';

export interface SavedSynergyState {
  activated: SynergyTierId[];
  tradeTypes: string[];
  woolTrades: number; spicePurchases: number;
  lowTaxTurns?: number | null; foodSurplusTurns?: number | null;
  highFaithTurns?: ExactInteger; highPeopleTurns?: ExactInteger;
  revoltTriggered?: boolean | null;
}
/** Validate values actually consumed by trading and seasonal eligibility, without rewriting history. */
export function validateSynergyMetadata(synergies: Record<string, unknown>): string | null {
  for (const key of ['woolTrades', 'spicePurchases']) {
    const value = synergies[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return `Save synergy ${key} must be a finite number.`;
  }
  for (const key of ['lowTaxTurns', 'foodSurplusTurns']) {
    const value = synergies[key];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) return `Save synergy ${key} must be a finite number or null.`;
  }
  for (const key of ['highFaithTurns', 'highPeopleTurns']) {
    const value = synergies[key];
    if (value !== undefined && !isExactInteger(value, true)) return `Save synergy ${key} is invalid.`;
  }
  const trades = synergies.tradeTypes;
  if (!Array.isArray(trades) || Array.from(trades).some(value => typeof value !== 'string')) return 'Save synergy tradeTypes must be a dense text list.';
  if (synergies.revoltTriggered != null && typeof synergies.revoltTriggered !== 'boolean') return 'Save synergy revoltTriggered must be true, false or null.';
  return null;
}
