/** Canonical feast outcome. UI previews and reducer settlement use one saved draw. */
import { FEAST_DATA, type HallMeterEffects } from '../data/decrees.ts';
import { createRandomCursor, isRandomState } from './random.ts';

export interface FeastSelection {
  guestId: string;
  entertainmentId: string;
  courseId: string;
  seed: number;
}

type FeastEvent = (typeof FEAST_DATA.randomEvents)[number];

export interface FeastOutcome {
  selection: FeastSelection;
  event: FeastEvent;
  totalEffects: HallMeterEffects;
  nextRandomState: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMeterEffects(value: unknown): value is HallMeterEffects {
  return isRecord(value) && Object.keys(value).length === 4 &&
    Number.isSafeInteger(value.people) && Number.isSafeInteger(value.treasury) &&
    Number.isSafeInteger(value.church) && Number.isSafeInteger(value.military);
}

function sameEffects(left: HallMeterEffects, right: HallMeterEffects): boolean {
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'guestId' in value && typeof value.guestId === 'string' &&
    'entertainmentId' in value && typeof value.entertainmentId === 'string' &&
    'courseId' in value && typeof value.courseId === 'string' &&
    'seed' in value && isRandomState(value.seed);
}

function sumEffects(effects: readonly HallMeterEffects[]): HallMeterEffects {
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
    selection: value,
    event: preview.event,
    totalEffects: sumEffects([guest.effects, entertainment.effects, course.effects, preview.event.effects]),
    nextRandomState: preview.nextRandomState,
  };
}

/** Old saves recorded only effects; accept one only if an authored plan could yield them. */
export function isFeastHistory(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 40) return false;
  const seenSeasons = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !isMeterEffects(entry.totalEffects) ||
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
