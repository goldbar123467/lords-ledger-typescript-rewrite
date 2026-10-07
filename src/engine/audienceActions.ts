import { applyHallMeterEffects } from './hallMeters.ts';
import encounters from '../data/audience.ts';
import type { HallMeterEffects } from '../data/decrees.ts';

/** Persist selected audience decisions; resolved IDs alone cannot reconstruct them. */
export const audienceReceipts = [
  {encounterId: 'aud_002', field: 'henrikWelcome', flag: 'welcomedHenrik', selected: [0, 1]},
  {encounterId: 'aud_006', field: 'edwinFunding', flag: 'fundedEdwin', selected: [0]},
  {encounterId: 'aud_009', field: 'scriptoriumGrant', flag: 'grantedScriptorium', selected: [0, 1]},
  {encounterId: 'aud_010', field: 'poacherPenalty', flag: 'harshOnPoacher', selected: [1]},
] as const;
export type AudienceReceipts = Partial<Record<typeof audienceReceipts[number]['field'], boolean | null>>;

export interface AudienceAction {
  type: 'HALL_AUDIENCE_RESPOND';
  payload: { encounterId: string; responseIndex: number };
}
interface AudienceCommandState {
  phase: string;
  greatHall: {
    meters: HallMeterEffects;
    audienceResolved?: readonly string[] | null;
    stewardTrust?: number | null;
  };
}
interface AudiencePlan {
  encounterId: string;
  consequences: HallMeterEffects;
  meters: HallMeterEffects;
  stewardTrust: number;
  chronicleText: string;
  receipt?: {field: typeof audienceReceipts[number]['field']; flag: typeof audienceReceipts[number]['flag']; value: boolean};
}

/** Resolve identity once; caller-supplied effects cannot override authored choices. */
export function planAudienceResponse(state: AudienceCommandState, payload: unknown): AudiencePlan | null {
  if (state.phase !== 'management' || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const encounterId = 'encounterId' in payload ? payload.encounterId : undefined;
  const index = 'responseIndex' in payload ? payload.responseIndex : undefined;
  if (typeof encounterId !== 'string' || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return null;
  const encounter = encounters.find(candidate => candidate.id === encounterId);
  const response = encounter?.responses[index];
  const resolved = state.greatHall.audienceResolved ?? [];
  if (!response || !Array.isArray(resolved) || resolved.includes(encounterId)) return null;
  const consequences = { ...response.consequences };
  const receipt = audienceReceipts.find(entry => entry.encounterId === encounterId);
  const details = Object.entries(consequences).filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)} ${value > 0 ? '+' : ''}${value}`);
  return {
    encounterId, consequences,
    ...(receipt ? {receipt: {field: receipt.field, flag: receipt.flag, value: receipt.selected.some(selected => selected === index)}} : {}),
    meters: applyHallMeterEffects(state.greatHall.meters, consequences),
    stewardTrust: Math.min(100, (state.greatHall.stewardTrust ?? 50) + 1),
    chronicleText: `Held audience in the Great Hall${details.length > 0 ? ` (${details.join(', ')})` : ''}`,
  };
}
