/** Mulberry32 stream for saved game transitions. Changing it requires a save migration. */
export const DEFAULT_SEED = 0x4c4c3230;

export function isRandomState(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function createRandomCursor(seed: number) {
  if (!isRandomState(seed)) throw new RangeError('Random seed must be an unsigned 32-bit integer.');
  let state = seed;
  let draws = 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      draws++;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
    },
    get state(): number { return state; },
    get draws(): number { return draws; },
  };
}

/** Assign a reproducible stream to a validated save made before rngState existed. */
export function seedLegacySnapshot(snapshot: unknown): number {
  const json = JSON.stringify(snapshot);
  if (json === undefined) throw new TypeError('Cannot seed an unserializable snapshot.');
  let hash = 2166136261;
  for (let index = 0; index < json.length; index++) {
    hash = Math.imul(hash ^ json.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}
