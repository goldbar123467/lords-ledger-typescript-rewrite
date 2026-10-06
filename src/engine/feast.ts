/** Canonical feast outcome. UI previews and reducer settlement use one saved draw. */
import { FEAST_DATA, type HallMeterEffects, type FeastGuestId, type FeastEntertainmentId, type FeastCourseId, type FeastEventId } from '../data/decrees.ts';
import { SEASON_INFO } from '../data/economy.ts';
import { createRandomCursor, isRandomState } from './random.ts';

export interface FeastSelection {
  readonly guestId: FeastGuestId;
  readonly entertainmentId: FeastEntertainmentId;
  readonly courseId: FeastCourseId;
  readonly seed: number;
}

interface FeastHistoryBase {
  readonly season: keyof typeof SEASON_INFO;
  readonly year: number;
  readonly totalEffects: Readonly<HallMeterEffects>;
}
/** Preserve accepted effect-only records without inventing an old selection or draw. */
export type FeastHistoryEntry = FeastHistoryBase & (
  { readonly guestId: FeastGuestId; readonly entertainmentId: FeastEntertainmentId;
    readonly courseId: FeastCourseId; readonly eventId: FeastEventId } |
  { readonly guestId?: never; readonly entertainmentId?: never;
    readonly courseId?: never; readonly eventId?: never }
);
export interface HallFeastSaveState {
  readonly hasFeastedThisSeason?: boolean;
  readonly feastHistory?: readonly FeastHistoryEntry[];
}

/** History is authoritative even when an older save omitted the convenience flag. */
export function hasFeastedInSeason(hall: HallFeastSaveState, season: keyof typeof SEASON_INFO, year: number): boolean {
  return Boolean(hall.hasFeastedThisSeason) || (hall.feastHistory ?? []).some(entry => entry.season === season && entry.year === year);
}

type FeastEvent = (typeof FEAST_DATA.randomEvents)[number];

export interface FeastOutcome {
  readonly selection: FeastSelection;
  readonly event: FeastEvent;
  readonly totalEffects: Readonly<HallMeterEffects>;
  readonly nextRandomState: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializedField(value: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(value, key);
}

function isMeterEffects(value: unknown): value is HallMeterEffects {
  return isRecord(value) && Object.keys(value).length === 4 &&
    ['people', 'treasury', 'church', 'military'].every(key => serializedField(value, key)) &&
    Number.isSafeInteger(value.people) && Number.isSafeInteger(value.treasury) &&
    Number.isSafeInteger(value.church) && Number.isSafeInteger(value.military);
}

function sameEffects(left: Readonly<HallMeterEffects>, right: Readonly<HallMeterEffects>): boolean {
  return left.people === right.people && left.treasury === right.treasury &&
    left.church === right.church && left.military === right.military;
}

export function previewFeastEvent(seed: number): { event: FeastEvent; nextRandomState: number } | null {
  if (!isRandomState(seed)) return null;
  const cursor = createRandomCursor(seed);
  const index = Math.floor(cursor.next() * FEAST_DATA.randomEvents.length);
  const event = FEAST_DATA.randomEvents[index];
  return event ? { event, nextRandomState: cursor.state } : null;
}

function isFeastSelection(value: unknown): value is FeastSelection {
  if (!isRecord(value) || !['guestId', 'entertainmentId', 'courseId', 'seed'].every(key => serializedField(value, key))) return false;
  return FEAST_DATA.guestOptions.some(option => option.id === value.guestId) &&
    FEAST_DATA.entertainmentOptions.some(option => option.id === value.entertainmentId) &&
    FEAST_DATA.courseOptions.some(option => option.id === value.courseId) && isRandomState(value.seed);
}

function sumEffects(effects: readonly Readonly<HallMeterEffects>[]): HallMeterEffects {
  return {
    people: effects.reduce((sum, item) => sum + item.people, 0),
    treasury: effects.reduce((sum, item) => sum + item.treasury, 0),
    church: effects.reduce((sum, item) => sum + item.church, 0),
    military: effects.reduce((sum, item) => sum + item.military, 0),
  };
}

export function resolveFeast(value: unknown, stateSeed: number): FeastOutcome | null {
  if (!isFeastSelection(value) || value.seed !== stateSeed) return null;
  const guest = FEAST_DATA.guestOptions.find(option => option.id === value.guestId);
  const entertainment = FEAST_DATA.entertainmentOptions.find(option => option.id === value.entertainmentId);
  const course = FEAST_DATA.courseOptions.find(option => option.id === value.courseId);
  const preview = previewFeastEvent(stateSeed);
  if (!guest || !entertainment || !course || !preview) return null;
  return {
    selection: { guestId: guest.id, entertainmentId: entertainment.id, courseId: course.id, seed: stateSeed },
    event: preview.event,
    totalEffects: sumEffects([guest.effects, entertainment.effects, course.effects, preview.event.effects]),
    nextRandomState: preview.nextRandomState,
  };
}

/** Old saves recorded only effects; accept one only if an authored plan could yield them. */
export function isFeastHistory(value: unknown): value is readonly FeastHistoryEntry[] {
  if (!Array.isArray(value) || value.length > 40) return false;
  const seenSeasons = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !['season', 'year', 'totalEffects'].every(key => serializedField(entry, key)) ||
        ['guestId', 'entertainmentId', 'courseId', 'eventId'].some(key => key in entry && !serializedField(entry, key)) ||
        !isMeterEffects(entry.totalEffects) ||
        !Number.isSafeInteger(entry.year) || typeof entry.year !== 'number' ||
        entry.year < 1 || entry.year > 10 ||
        typeof entry.season !== 'string' ||
        !['spring', 'summer', 'autumn', 'winter'].includes(entry.season)) return false;
    const seasonKey = `${entry.year}:${entry.season}`;
    if (seenSeasons.has(seasonKey)) return false;
    seenSeasons.add(seasonKey);
    const detailed = ['guestId', 'entertainmentId', 'courseId', 'eventId']
      .some(key => entry[key] !== undefined);
    const guests = detailed
      ? FEAST_DATA.guestOptions.filter(option => option.id === entry.guestId)
      : FEAST_DATA.guestOptions;
    const entertainments = detailed
      ? FEAST_DATA.entertainmentOptions.filter(option => option.id === entry.entertainmentId)
      : FEAST_DATA.entertainmentOptions;
    const courses = detailed
      ? FEAST_DATA.courseOptions.filter(option => option.id === entry.courseId)
      : FEAST_DATA.courseOptions;
    const events = detailed
      ? FEAST_DATA.randomEvents.filter(event => event.id === entry.eventId)
      : FEAST_DATA.randomEvents;
    let matched = false;
    for (const guest of guests) for (const entertainment of entertainments) {
      for (const course of courses) for (const event of events) {
        if (sameEffects(entry.totalEffects,
          sumEffects([guest.effects, entertainment.effects, course.effects, event.effects]))) matched = true;
      }
    }
    if (!matched) return false;
  }
  return true;
}

/** Validate consumed optional Feast fields without rewriting legacy defaults. */
export function validateHallFeastState(value: unknown, season: unknown, year: unknown): string | null {
  if (!isRecord(value)) return 'Save Great Hall state is invalid.';
  if (['hasFeastedThisSeason', 'feastHistory'].some(key => key in value && !serializedField(value, key))) {
    return 'Save Feast serialized fields are invalid.';
  }
  if (value.hasFeastedThisSeason !== undefined && typeof value.hasFeastedThisSeason !== 'boolean') return 'Save feast limit is invalid.';
  if (value.feastHistory !== undefined && !isFeastHistory(value.feastHistory)) return 'Save feast history is invalid.';
  if (value.hasFeastedThisSeason === false && Array.isArray(value.feastHistory) &&
      value.feastHistory.some(entry => isRecord(entry) && entry.season === season && entry.year === year)) {
    return 'Save feast limit and history disagree.';
  }
  return null;
}
