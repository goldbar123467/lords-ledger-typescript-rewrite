/** Saved dialogue choices for the Tavern's merchant and veteran. */
import {
  ALDRIC_MILITARY_COUNSEL, ALDRIC_TRAINING_OFFERS, ALDRIC_WAR_STORIES,
  MARTA_MARKET_TIPS, MARTA_OFFERS, MARTA_TRADE_STORIES,
} from '../data/tavern.js';

export type CompanionId = 'marta' | 'aldric';
export type CompanionContent =
  | { type: 'advice'; index: number }
  | { type: 'story'; index: number }
  | { type: 'offer'; offerId: string; resolution: null | 'accepted' | 'declined' };

export interface CompanionNext {
  content: CompanionContent;
  adviceRemaining: number[];
  storiesRemaining: number[];
}

function registry(kind: CompanionId) {
  return kind === 'marta'
    ? { advice: MARTA_MARKET_TIPS, stories: MARTA_TRADE_STORIES, offers: MARTA_OFFERS }
    : { advice: ALDRIC_MILITARY_COUNSEL, stories: ALDRIC_WAR_STORIES, offers: ALDRIC_TRAINING_OFFERS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIndexQueue(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length <= length &&
    value.every(index => Number.isSafeInteger(index) && index >= 0 && index < length) &&
    new Set(value).size === value.length;
}

function drawUnit(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Companion random source must return a finite value in [0, 1).');
  }
  return value;
}

function pickFromBag(random: () => number, remaining: number[], length: number): {
  index: number; remaining: number[];
} {
  const pool = remaining.length > 0 ? [...remaining] : Array.from({ length }, (_, index) => index);
  const slot = Math.floor(drawUnit(random) * pool.length);
  const index = pool.splice(slot, 1)[0];
  if (index === undefined) throw new Error('Companion dialogue registry is empty.');
  return { index, remaining: pool };
}

export function isCompanionOfferIds(kind: CompanionId, value: unknown): value is string[] {
  const ids = registry(kind).offers.map(offer => offer.id);
  return Array.isArray(value) && value.length <= ids.length &&
    value.every(id => typeof id === 'string' && ids.includes(id)) &&
    new Set(value).size === value.length;
}

export function isCompanionQueue(kind: CompanionId, category: 'advice' | 'stories', value: unknown): value is number[] {
  return isIndexQueue(value, registry(kind)[category].length);
}

export function isCompanionContent(kind: CompanionId, value: unknown): value is CompanionContent | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const data = registry(kind);
  if (value.type === 'advice') {
    return Number.isSafeInteger(value.index) && (value.index as number) >= 0 &&
      (value.index as number) < data.advice.length;
  }
  if (value.type === 'story') {
    return Number.isSafeInteger(value.index) && (value.index as number) >= 0 &&
      (value.index as number) < data.stories.length;
  }
  if (value.type === 'offer') {
    return typeof value.offerId === 'string' &&
      data.offers.some(offer => offer.id === value.offerId) &&
      (value.resolution === null || value.resolution === 'accepted' || value.resolution === 'declined');
  }
  return false;
}

/** Preserve the authored 25% offer, 35% advice, 40% story mix. */
export function nextCompanionContent(
  kind: CompanionId,
  random: () => number,
  usedOfferIds: unknown,
  adviceRemaining: unknown,
  storiesRemaining: unknown,
): CompanionNext | null {
  if (!isCompanionOfferIds(kind, usedOfferIds) ||
      !isCompanionQueue(kind, 'advice', adviceRemaining) ||
      !isCompanionQueue(kind, 'stories', storiesRemaining)) return null;
  const data = registry(kind);
  const available = data.offers.filter(offer => !usedOfferIds.includes(offer.id));
  const roll = drawUnit(random);
  if (available.length > 0 && roll < 0.25) {
    const offer = available[Math.floor(drawUnit(random) * available.length)];
    if (!offer) throw new Error('Companion offer registry is empty.');
    return {
      content: { type: 'offer', offerId: offer.id, resolution: null },
      adviceRemaining,
      storiesRemaining,
    };
  }
  if (roll < 0.60) {
    const picked = pickFromBag(random, adviceRemaining, data.advice.length);
    return {
      content: { type: 'advice', index: picked.index },
      adviceRemaining: picked.remaining,
      storiesRemaining,
    };
  }
  const picked = pickFromBag(random, storiesRemaining, data.stories.length);
  return {
    content: { type: 'story', index: picked.index },
    adviceRemaining,
    storiesRemaining: picked.remaining,
  };
}
