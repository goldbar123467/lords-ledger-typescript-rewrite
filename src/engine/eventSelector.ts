/** Event selection keeps content order and used-ID behavior from the legacy game. */
export type RandomSource = () => number;

export interface SelectableEvent {
  id: string;
  requiresMeter?: string;
}

export interface SeasonalEvent extends SelectableEvent {
  season: string;
}

function pickRandom<T>(items: readonly T[], random: RandomSource): T | null {
  if (items.length === 0) return null;
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('Random source must return a finite value in [0, 1).');
  }
  return items[Math.floor(roll * items.length)] ?? null;
}

function filterUnused<T extends SelectableEvent>(items: readonly T[], usedIds: readonly string[]): readonly T[] {
  const unused = items.filter(item => !usedIds.includes(item.id));
  return unused.length > 0 ? unused : items;
}

export function selectSeasonalEvent<T extends SeasonalEvent>(
  season: string,
  usedSeasonalIds: readonly string[],
  _turn: number,
  allSeasonalEvents: readonly T[] | null | undefined,
  random: RandomSource,
): T | null {
  if (!allSeasonalEvents?.length) return null;
  const forSeason = allSeasonalEvents.filter(event => event.season === season);
  if (forSeason.length === 0) return pickRandom(allSeasonalEvents, random);
  return pickRandom(filterUnused(forSeason, usedSeasonalIds), random);
}

export function selectRandomEvent<T extends SelectableEvent>(
  usedRandomIds: readonly string[],
  turn: number,
  allRandomEvents: readonly T[] | null | undefined,
  random: RandomSource,
): T | null {
  if (!allRandomEvents?.length) return null;
  const eligible = allRandomEvents.filter(event =>
    event.requiresMeter === 'military' ? turn >= 3 :
    event.requiresMeter === 'faith' ? turn >= 5 : true,
  );
  return pickRandom(filterUnused(eligible, usedRandomIds), random);
}
