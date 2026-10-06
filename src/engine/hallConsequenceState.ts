import { COMPOUND_RULES, REPUTATION_TRACKS, type CompoundFlag, type ReputationTrack } from '../data/greatHall.ts';
import { SEASON_INFO } from '../data/economy.ts';
import type { HallMeterEffects } from '../data/decrees.ts';
import { hallMeterKeys } from './hallMeters.ts';

export interface HallHistoricalSnapshot {
  readonly turn: number;
  readonly season: keyof typeof SEASON_INFO;
  readonly year: number;
  readonly meters: Readonly<HallMeterEffects>;
}
/** Stored prose/effects may come from older content; do not reconstruct the event. */
export interface HallPendingEvent {
  readonly type: 'crisis' | 'peak';
  readonly meter?: string | null;
  readonly text: string;
  readonly chronicle?: string | null;
  readonly effects?: Readonly<Partial<HallMeterEffects>> | null;
}
export interface HallConsequenceSaveState {
  readonly reputation?: string | null;
  readonly reputationTrack?: ReputationTrack | null;
  readonly reputationScores?: Readonly<Partial<Record<ReputationTrack, number>>> | null;
  readonly meterHistory?: readonly HallHistoricalSnapshot[] | null;
  readonly compoundFlags?: Readonly<Partial<Record<CompoundFlag, boolean>>> | null;
  readonly crisisTriggered?: Readonly<Partial<Record<keyof HallMeterEffects, boolean>>> | null;
  readonly peakTriggered?: Readonly<Partial<Record<keyof HallMeterEffects, boolean>>> | null;
  readonly pendingHallEvent?: HallPendingEvent | null;
}
const fields = ['reputation', 'reputationTrack', 'reputationScores', 'meterHistory', 'compoundFlags', 'crisisTriggered', 'peakTriggered', 'pendingHallEvent'] as const;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function serialized(value: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(value, key);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function counter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function partialEffects(value: unknown): boolean {
  return record(value) && !hallMeterKeys.some(key => key in value && !serialized(value, key)) &&
    Object.keys(value).every(key => hallMeterKeys.some(meter => meter === key) && finite(value[key]));
}
function snapshot(value: unknown): boolean {
  if (!record(value) || !['turn', 'season', 'year', 'meters'].every(key => serialized(value, key)) ||
      !counter(value.turn) || !counter(value.year) || value.year === 0 || typeof value.season !== 'string' ||
      !Object.hasOwn(SEASON_INFO, value.season)) return false;
  const meters = value.meters;
  return record(meters) && hallMeterKeys.every(key => serialized(meters, key) && finite(meters[key]) && meters[key] >= 0 && meters[key] <= 100);
}
function history(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !snapshot(value[i])) return false;
  // Duplicate dates and independent historical length are preserved.
  return true;
}
function numericScores(value: unknown): boolean {
  return record(value) && !Object.keys(REPUTATION_TRACKS).some(key => key in value && !serialized(value, key)) &&
    Object.values(value).every(score => finite(score) && score >= 0);
}
function flags(value: unknown, knownKeys: readonly string[]): boolean {
  return record(value) && !knownKeys.some(key => key in value && !serialized(value, key)) &&
    Object.values(value).every(flag => typeof flag === 'boolean');
}
function pending(value: unknown): boolean {
  if (!record(value) || !['type', 'text'].every(key => serialized(value, key)) ||
      !['meter', 'chronicle', 'effects'].every(key => !(key in value) || serialized(value, key)) ||
      (value.type !== 'crisis' && value.type !== 'peak') || typeof value.text !== 'string' || value.text.trim().length === 0) return false;
  if (value.meter != null && typeof value.meter !== 'string') return false;
  if (value.chronicle != null && (typeof value.chronicle !== 'string' ||
      (value.chronicle !== '' && value.chronicle.trim().length === 0))) return false;
  return value.effects == null || partialEffects(value.effects);
}

/** Validate consumed shell/consequence fields, leaving safe historical values untouched. */
export function validateHallConsequenceState(value: unknown): string | null {
  if (!record(value)) return 'Save Great Hall state is invalid.';
  if (fields.some(key => key in value && !serialized(value, key))) return 'Save Great Hall serialized consequence fields are invalid.';
  if (value.reputation != null && typeof value.reputation !== 'string') return 'Save Great Hall reputation is invalid.';
  if (value.reputationTrack != null && (typeof value.reputationTrack !== 'string' || !Object.hasOwn(REPUTATION_TRACKS, value.reputationTrack))) return 'Save Great Hall reputation track is invalid.';
  if (value.reputationScores != null && !numericScores(value.reputationScores)) return 'Save Great Hall reputation scores are invalid.';
  if (value.meterHistory != null && !history(value.meterHistory)) return 'Save Great Hall meter history is invalid.';
  const compoundKeys = COMPOUND_RULES.map(rule => rule.flag);
  if (value.compoundFlags != null && !flags(value.compoundFlags, compoundKeys)) return 'Save Great Hall compound flags are invalid.';
  if (value.crisisTriggered != null && !flags(value.crisisTriggered, hallMeterKeys)) return 'Save Great Hall crisis flags are invalid.';
  if (value.peakTriggered != null && !flags(value.peakTriggered, hallMeterKeys)) return 'Save Great Hall peak flags are invalid.';
  if (value.pendingHallEvent != null && !pending(value.pendingHallEvent)) return 'Save Great Hall pending event is invalid.';
  return null;
}
