/** Consecutive seasons at zero denarii before creditors seize the estate. */
export const BANKRUPTCY_SEASONS = 6;

export function famineSeasonsForDifficulty(difficulty: string): number {
  return difficulty === 'easy' ? 4 : difficulty === 'hard' ? 2 : 3;
}
