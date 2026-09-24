import { MAX_GARRISON } from './economy.ts';
import { SOLDIER_TYPES } from './military.js';

type SoldierType = keyof typeof SOLDIER_TYPES;
type Garrison = Record<SoldierType, number>;

interface RecruitmentState {
  denarii: number;
  population: number;
  garrison: number;
  military?: { garrison: Garrison } | null;
}

/** Capacity shared by normal recruitment and Aldric's referral. */
export function getRecruitmentCapacity(state: RecruitmentState, soldierType: SoldierType): number {
  const roster = state.military?.garrison;
  const currentType = roster?.[soldierType] ?? (soldierType === 'levy' ? state.garrison : 0);
  const rosterTotal = roster ? roster.levy + roster.menAtArms + roster.knights : state.garrison;
  const total = Math.max(state.garrison, rosterTotal);
  const typeLimit = SOLDIER_TYPES[soldierType].max;
  return Math.max(0, Math.min(
    typeLimit === null ? Infinity : typeLimit - currentType,
    MAX_GARRISON - total,
    Math.floor(state.population * 0.6) - total,
  ));
}

/** Basic Drill adds one flat defense point per stationed soldier during each of its three seasons. */
export function getAldricDrillBonus(military: { garrison: Garrison }, seasonsRemaining = 0): number {
  if (!Number.isSafeInteger(seasonsRemaining) || seasonsRemaining <= 0) return 0;
  const { levy, menAtArms, knights } = military.garrison;
  return levy + menAtArms + knights;
}
