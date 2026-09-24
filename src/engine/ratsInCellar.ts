/** Deterministic rat schedule and authored result scoring shared by UI and reducer. */
import { RATS_DURATION_MS, RATS_GRID_SIZE, RATS_RATINGS } from '../data/tavern.js';

/** First spawn is at 500 ms; later spawns are at least 1000 ms apart. */
export const MAX_RAT_SPAWNS = Math.max(0, Math.ceil((RATS_DURATION_MS - 500) / 1000));

export interface RatSpawn {
  atMs: number;
  cellIndex: number;
  visibilityMs: number;
}

export interface RatScore {
  caught: number;
  escaped: number;
  foodLost: number;
  reward: number;
  rating: (typeof RATS_RATINGS)[number];
}

function drawUnit(random: () => number): number {
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError('Rat schedule random source must return a finite value in [0, 1).');
  }
  return draw;
}

export function planRatRun(random: () => number): RatSpawn[] {
  const cells = RATS_GRID_SIZE * RATS_GRID_SIZE;
  if (cells < 2) throw new Error('The rat grid needs at least two cells.');
  const spawns: RatSpawn[] = [];
  let atMs = 500;
  let lastCell = -1;
  while (atMs < RATS_DURATION_MS) {
    const slot = Math.floor(drawUnit(random) * (lastCell < 0 ? cells : cells - 1));
    const cellIndex = lastCell < 0 || slot < lastCell ? slot : slot + 1;
    spawns.push({
      atMs,
      cellIndex,
      visibilityMs: atMs < 7000 ? 1500 : atMs < 14000 ? 1000 : 700,
    });
    lastCell = cellIndex;
    atMs += 1000 + drawUnit(random) * 500;
  }
  return spawns;
}

export function scoreRatRun(caught: unknown, escaped: unknown, availableSpawns: number): RatScore | null {
  if (!Number.isSafeInteger(caught) || !Number.isSafeInteger(escaped) ||
      !Number.isSafeInteger(availableSpawns) || availableSpawns < 0 ||
      (caught as number) < 0 || (escaped as number) < 0 ||
      (caught as number) + (escaped as number) > availableSpawns) return null;
  const count = caught as number;
  const escapes = escaped as number;
  const rating = RATS_RATINGS.find(row => count >= row.min && count <= row.max);
  if (!rating) throw new Error('The rat ratings do not cover a reachable score.');
  return {
    caught: count,
    escaped: escapes,
    foodLost: escapes * rating.foodPerEscape,
    reward: rating.reward,
    rating,
  };
}
