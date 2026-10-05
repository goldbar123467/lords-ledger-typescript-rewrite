import { INITIAL_FAMILIES } from '../data/people.ts';
import { SEASON_INFO } from '../data/economy.ts';
import { isLaborPercentage, LABOR_LIMITS } from './peopleActions.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function dense(value: unknown, valid: (entry: unknown) => boolean, max = Infinity): value is unknown[] {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !valid(value[i])) return false;
  return true;
}
function family(value: unknown): boolean {
  if (!record(value)) return false;
  const authored = INITIAL_FAMILIES.find(f => f.id === value.id);
  if (!authored || value.tier !== authored.tier || value.roleIcon !== authored.roleIcon ||
      value.sensitivity !== authored.sensitivity || value.maxLoyalty !== authored.maxLoyalty) return false;
  if (!count(value.loyalty) || value.loyalty > authored.maxLoyalty || !count(value.turnsGone) ||
      !count(value.generations) || value.generations === 0 || typeof value.present !== 'boolean') return false;
  for (const key of ['name', 'role', 'narrative'] as const) if (!text(value[key])) return false;
  for (const key of ['leaveNarrative', 'returnNarrative'] as const) {
    if (value[key] !== null && !text(value[key])) return false;
  }
  const bonus = value.bonus;
  return record(bonus) && bonus.type === authored.bonus.type && bonus.amount === authored.bonus.amount && text(bonus.desc);
}

/** Validate consumed nested fields without rewriting older optional defaults or prose. */
export function validatePeopleState(value: unknown): string | null {
  if (!record(value)) return 'Save People section is invalid.';
  for (const key of ['laborFarming', 'laborGarrison', 'laborChurch'] as const) {
    if (value[key] != null && !isLaborPercentage(value[key], LABOR_LIMITS[key])) return `Save People ${key} is invalid.`;
  }
  const tiers = value.tiers;
  // Older reducer versions could produce nonconserving totals. Preserve their counts
  // at this structural boundary; seasonal reconciliation handles population changes.
  if (tiers != null && (!record(tiers) || !['serfs', 'freemen', 'skilled'].every(key => count(tiers[key])))) {
    return 'Save People tiers are invalid.';
  }
  const families = value.notableFamilies;
  if (families != null && (!dense(families, family, INITIAL_FAMILIES.length) ||
      new Set(families.map(f => record(f) ? f.id : undefined)).size !== families.length)) {
    return 'Save People family roster is invalid.';
  }
  const feed = value.villageFeed;
  if (feed != null && !dense(feed, e => record(e) && text(e.text) &&
      (e.type === 'life' || e.type === 'population' || e.type === 'warning'))) return 'Save People village feed is invalid.';
  const history = value.taxHistory;
  if (history != null && !dense(history, e => record(e) && typeof e.season === 'string' &&
      Object.hasOwn(SEASON_INFO, e.season) && count(e.year) && e.year > 0 && nonnegative(e.revenue), 8)) {
    return 'Save People tax history is invalid.';
  }
  return null;
}
