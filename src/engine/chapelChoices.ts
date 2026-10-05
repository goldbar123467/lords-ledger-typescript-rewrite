import { MORAL_DILEMMAS, type ChapelChoice } from '../data/chapel.ts';

/** Resolve command indices against authored content, never a persisted effect object. */
export function getChapelChoice(dilemmaId: unknown, index: unknown): ChapelChoice | undefined {
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return undefined;
  return MORAL_DILEMMAS.find(dilemma => dilemma.id === dilemmaId)?.choices[index];
}

export function chapelChoiceCost(choice: ChapelChoice): number {
  return Math.max(0, -(choice.effects.denarii ?? 0));
}

export function canAffordChapelChoice(choice: ChapelChoice, denarii: number): boolean {
  return Number.isFinite(denarii) && denarii >= chapelChoiceCost(choice);
}
