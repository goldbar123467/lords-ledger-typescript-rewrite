import { applyHallMeterEffects } from './hallMeters.ts';
import disputes, {type DisputeId, type DisputeRuling} from '../data/disputes.ts';
import type {HallRuling} from '../data/greatHall.ts';
import type {HallMeterEffects} from '../data/decrees.ts';

export interface DisputeAction {
  type: 'HALL_RULE_DISPUTE';
  payload: {disputeId: DisputeId; rulingId: DisputeRuling['id']};
}
interface DisputeCommandState {
  phase: string;
  season: string;
  greatHall: {
    meters: HallMeterEffects;
    rulingHistory?: readonly HallRuling[] | null;
  };
}

/** Keep the visible queue and command eligibility on the same authored order. */
export function getAvailableDisputes(season: string, history: readonly HallRuling[] | null | undefined) {
  const resolved = history ?? [];
  if (!Array.isArray(resolved) || resolved.some(r => typeof r !== 'object' || r === null)) return [];
  const ids = new Set(resolved.map(r => r.disputeId));
  return disputes.filter(d => (d.season === 'any' || d.season === season) && !ids.has(d.id)).slice(0, 4);
}

/** Caller effects and prose are ignored; only a current authored choice can act. */
export function planDisputeRuling(state: DisputeCommandState, payload: unknown) {
  if (state.phase !== 'management' || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const disputeId = 'disputeId' in payload ? payload.disputeId : undefined;
  const rulingId = 'rulingId' in payload ? payload.rulingId : undefined;
  if (typeof disputeId !== 'string' || typeof rulingId !== 'string') return null;
  const dispute = getAvailableDisputes(state.season, state.greatHall.rulingHistory).find(d => d.id === disputeId);
  const ruling = dispute?.rulings.find(r => r.id === rulingId);
  if (!dispute || !ruling) return null;
  const consequences = {...ruling.consequences};
  return {
    disputeId: dispute.id, rulingId: ruling.id, decree: ruling.decree, consequences,
    meters: applyHallMeterEffects(state.greatHall.meters, consequences),
  };
}
