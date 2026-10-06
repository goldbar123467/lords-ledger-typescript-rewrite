import { DEFAULT_METERS } from '../data/greatHall.ts';
import type { HallMeterEffects } from '../data/decrees.ts';
import { validateHallAudienceState, type HallAudienceSaveState } from './hallAudienceState.ts';
import { isHallPendingEvent, type HallConsequenceSaveState } from './hallConsequenceState.ts';
import { applyHallMeterEffects } from './hallMeters.ts';
interface ConsequenceContext {
  readonly phase: string;
  readonly turn: number;
  readonly season: string;
  readonly year: number;
  readonly greatHall: HallAudienceSaveState & HallConsequenceSaveState;
}
/** Only a pending, readable event may settle during estate management. */
export function planHallEventDismissal(state: ConsequenceContext) {
  if (state.phase !== 'management' || !Number.isSafeInteger(state.turn) || state.turn < 1 || state.turn > 40 ||
      state.year !== Math.ceil(state.turn / 4) ||
      state.season !== ['spring', 'summer', 'autumn', 'winter'][(state.turn - 1) % 4] ||
      validateHallAudienceState(state.greatHall) !== null || !isHallPendingEvent(state.greatHall.pendingHallEvent)) return null;
  const event = state.greatHall.pendingHallEvent;
  const effects = event.effects ?? {};
  const meters = applyHallMeterEffects(state.greatHall.meters, {
    people: effects.people ?? 0, treasury: effects.treasury ?? 0,
    church: effects.church ?? 0, military: effects.military ?? 0,
  });
  return { event, effects, meters };
}
/** A genuine zero in a historical snapshot is a baseline, not a missing value. */
export function hallMeterDeltas(current: Readonly<HallMeterEffects>, previous: Readonly<HallMeterEffects> = DEFAULT_METERS): HallMeterEffects {
  return {people: current.people - previous.people, treasury: current.treasury - previous.treasury,
    church: current.church - previous.church, military: current.military - previous.military};
}
