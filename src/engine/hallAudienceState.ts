import encounters from '../data/audience.ts';
import { SEASON_INFO } from '../data/economy.ts';
import type { HallMeterEffects } from '../data/decrees.ts';

const meterKeys = ['people', 'treasury', 'church', 'military'] as const;
const logTypes = ['dispute', 'audience', 'decree', 'decree_revoke', 'council', 'feast', 'crisis', 'peak'] as const;
const audienceIds = new Set<string>(encounters.map(encounter => encounter.id));

export interface HallLogEntry {
  type: typeof logTypes[number];
  text: string;
  turn: number;
  season: keyof typeof SEASON_INFO;
  year: number;
  consequences?: Partial<HallMeterEffects> | null;
}
/** Consumed audience/log fields only. Other Hall domains are validated separately. */
export interface HallAudienceSaveState {
  meters: HallMeterEffects;
  audienceResolved?: string[] | null;
  stewardTrust?: number | null;
  hallLog?: HallLogEntry[] | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function serializedField(value: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(value, key);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function dense(value: unknown, valid: (entry: unknown) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !valid(value[i])) return false;
  return true;
}
function logEntry(value: unknown): boolean {
  if (!record(value) || !['type', 'text', 'turn', 'season', 'year'].every(key => serializedField(value, key)) ||
      !logTypes.some(type => type === value.type) || typeof value.text !== 'string' || value.text.trim().length === 0 ||
      !count(value.turn) || !count(value.year) || value.year === 0 || typeof value.season !== 'string' ||
      !Object.hasOwn(SEASON_INFO, value.season)) return false;
  if ('consequences' in value && !serializedField(value, 'consequences')) return false;
  const effects = value.consequences;
  // Older logs may omit effects or contain only the nonzero known meters.
  return effects == null || (record(effects) && Object.keys(effects).every(key =>
    meterKeys.some(meter => meter === key) && finite(effects[key])));
}

/** Reject damaged consumed shapes without canonicalizing historical optional defaults. */
export function validateHallAudienceState(value: unknown): string | null {
  if (!record(value)) return 'Save Great Hall state is invalid.';
  if (!serializedField(value, 'meters') || ['audienceResolved', 'stewardTrust', 'hallLog'].some(key =>
      key in value && !serializedField(value, key))) return 'Save Great Hall serialized fields are invalid.';
  const meters = value.meters;
  if (!record(meters) || !meterKeys.every(key => serializedField(meters, key) &&
      finite(meters[key]) && meters[key] >= 0 && meters[key] <= 100)) return 'Save Great Hall approval is invalid.';
  const resolved = value.audienceResolved;
  // Pre-guard reducers could append repeats. Preserve these safe historical lists.
  if (resolved != null && !dense(resolved, id => typeof id === 'string' && audienceIds.has(id))) {
    return 'Save Great Hall audience history is invalid.';
  }
  const trust = value.stewardTrust;
  if (trust != null && (!finite(trust) || trust < 0 || trust > 100)) return 'Save Great Hall steward trust is invalid.';
  if (value.hallLog != null && !dense(value.hallLog, logEntry)) return 'Save Great Hall log is invalid.';
  return null;
}
