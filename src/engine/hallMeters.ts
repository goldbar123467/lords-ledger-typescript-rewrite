import type { HallMeterEffects } from '../data/decrees.ts';
export const hallMeterKeys = ['people', 'treasury', 'church', 'military'] as const;
/** Apply an authored complete effect record without mutating either input. */
export function applyHallMeterEffects(previous: Readonly<HallMeterEffects>, effects: Readonly<HallMeterEffects>): HallMeterEffects {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { people: clamp(previous.people + effects.people), treasury: clamp(previous.treasury + effects.treasury),
    church: clamp(previous.church + effects.church), military: clamp(previous.military + effects.military) };
}
