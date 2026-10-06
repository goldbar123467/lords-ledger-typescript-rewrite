import { DECREE_OPTIONS, COUNCIL_TOPICS, type DecreeId, type CouncilTopicId, type CouncilChoiceId, type HallMeterEffects } from '../data/decrees.ts';
import { applyHallMeterEffects, hallMeterKeys } from './hallMeters.ts';
export interface HallCivicSaveState {
  activeDecrees?: readonly DecreeId[] | null;
  councilResolved?: readonly CouncilTopicId[] | null;
  decreeSlotsUsed?: number | null;
}
interface CivicCommandState {
  phase: string;
  turn: number;
  greatHall: HallCivicSaveState & { meters: HallMeterEffects };
}
export type HallCivicAction =
  | { type: 'HALL_ISSUE_DECREE' | 'HALL_REVOKE_DECREE'; payload: { decreeId: DecreeId } }
  | { type: 'HALL_COUNCIL_VOTE'; payload: { topicId: CouncilTopicId; optionId: CouncilChoiceId } };
const decreeIds = new Set<string>(DECREE_OPTIONS.map(d => d.id));
const topicIds = new Set<string>(COUNCIL_TOPICS.map(t => t.id));
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function knownIds(value: unknown, ids: ReadonlySet<string>): boolean {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || typeof value[i] !== 'string' || !ids.has(value[i])) return false;
  return true;
}
/** Retain safe pre-guard duplicates and counts above the current seasonal cap. */
export function validateHallCivicState(value: unknown): string | null {
  if (!record(value)) return 'Save Great Hall state is invalid.';
  if (['activeDecrees', 'councilResolved', 'decreeSlotsUsed'].some(key => key in value &&
    !Object.prototype.propertyIsEnumerable.call(value, key))) return 'Save Great Hall serialized civic fields are invalid.';
  if (!knownIds(value.activeDecrees, decreeIds)) return 'Save Great Hall active decrees are invalid.';
  if (!knownIds(value.councilResolved, topicIds)) return 'Save Great Hall council history is invalid.';
  if (value.decreeSlotsUsed != null && !count(value.decreeSlotsUsed)) return 'Save Great Hall decree count is invalid.';
  return null;
}
function management(state: CivicCommandState): boolean {
  return state.phase === 'management' && Number.isSafeInteger(state.turn) && state.turn >= 1 && state.turn <= 40 &&
    hallMeterKeys.every(key => Number.isFinite(state.greatHall.meters[key]) && state.greatHall.meters[key] >= 0 && state.greatHall.meters[key] <= 100);
}
export function isCouncilUnlocked(turn: number, approval: number): boolean {
  return turn >= 4 || approval > 70;
}
/** Authored order is the queue; all four topics can be resolved when eligible. */
export function getAvailableCouncilTopic(resolved: HallCivicSaveState['councilResolved']) {
  if (!knownIds(resolved, topicIds)) return null;
  return COUNCIL_TOPICS.find(topic => !(resolved ?? []).includes(topic.id)) ?? null;
}
export function planCouncilVote(state: CivicCommandState, payload: unknown) {
  if (!management(state) || !record(payload) || !isCouncilUnlocked(state.turn, state.greatHall.meters.people)) return null;
  const topic = getAvailableCouncilTopic(state.greatHall.councilResolved);
  const option = topic?.options.find(option => option.id === payload.optionId);
  if (!topic || topic.id !== payload.topicId || !option) return null;
  const consequences = { ...option.consequences };
  return { topicId: topic.id, optionId: option.id, consequences, meters: applyHallMeterEffects(state.greatHall.meters, consequences) };
}
export function planDecreeIssue(state: CivicCommandState, payload: unknown) {
  if (!management(state) || !record(payload) || !knownIds(state.greatHall.activeDecrees, decreeIds)) return null;
  const used = state.greatHall.decreeSlotsUsed ?? 0;
  const decree = DECREE_OPTIONS.find(decree => decree.id === payload.decreeId);
  if (!decree || !count(used) || used >= 2 || (state.greatHall.activeDecrees ?? []).includes(decree.id)) return null;
  const effects = { ...decree.effects };
  return { decreeId: decree.id, effects, used: used + 1, meters: applyHallMeterEffects(state.greatHall.meters, effects) };
}
export function planDecreeRevocation(state: CivicCommandState, payload: unknown) {
  if (!management(state) || !record(payload) || !knownIds(state.greatHall.activeDecrees, decreeIds)) return null;
  const decree = DECREE_OPTIONS.find(decree => decree.id === payload.decreeId);
  if (!decree?.revokable || !(state.greatHall.activeDecrees ?? []).includes(decree.id)) return null;
  return { decreeId: decree.id, activeDecrees: (state.greatHall.activeDecrees ?? []).filter(id => id !== decree.id) };
}
