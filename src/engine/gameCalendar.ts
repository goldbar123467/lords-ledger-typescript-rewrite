/** The existing forty-season calendar is shared by transition owners. */
export const MAX_TURNS = 40;
const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export function turnToSeasonYear(turn: number) {
  const zeroIndexed = turn - 1;
  const seasonIndex = zeroIndexed % 4;
  const year = Math.floor(zeroIndexed / 4) + 1;
  const season = SEASONS[seasonIndex];
  if (season === undefined) throw new RangeError('Turn has no valid season.');
  return { season, year };
}
