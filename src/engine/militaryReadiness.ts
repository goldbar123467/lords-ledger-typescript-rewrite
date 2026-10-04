import {
  calculateDefenseRating, getTotalGarrison, getMoraleLevel,
  type MilitaryDefenseState, type Garrison, type FortificationLevels,
  CRIMINAL_DEFENSE_THRESHOLD, SCOTTISH_DEFENSE_THRESHOLD,
} from '../data/military.ts';
import { getAldricDrillBonus } from '../data/militaryRules.ts';
import { calculateForgeReadiness, type EquippedItem } from './forgeReadiness.ts';

/** Incremental consumed-state contract, not validation of an imported whole-game save. */
export interface MilitaryReadinessState {
  garrison?: number;
  castleLevel?: FortificationLevels['walls'];
  military?: (Partial<FortificationLevels> & { garrison?: Partial<Garrison>; morale?: number }) | null;
  blacksmith?: { equipped?: readonly EquippedItem[] } | null;
  tavern?: { aldricDrillActive?: number } | null;
  watchtower?: { warnings?: { criminalRaidBonus?: number; scottishRaidBonus?: number; raidRequirementReduction?: number } } | null;
}

/** Same current-state calculation for simulation and advice; future seasonal changes still matter. */
export function getMilitaryReadiness(state: MilitaryReadinessState, capturedDrillBonus?: number) {
  const source = state.military;
  const military: MilitaryDefenseState = {
    garrison: { levy: source?.garrison?.levy ?? state.garrison ?? 0,
      menAtArms: source?.garrison?.menAtArms ?? 0, knights: source?.garrison?.knights ?? 0 },
    walls: source?.walls ?? state.castleLevel ?? 1, gate: source?.gate ?? 0,
    moat: source?.moat ?? 0, morale: source?.morale ?? 50,
  };
  const garrison = state.garrison ?? getTotalGarrison(military.garrison);
  const forgeBonus = calculateForgeReadiness(state.blacksmith?.equipped ?? [], garrison).defenseBonus;
  const drillBonus = capturedDrillBonus ?? getAldricDrillBonus(military, state.tavern?.aldricDrillActive);
  const warnings = state.watchtower?.warnings;
  const criminalScoutBonus = 0 + (warnings?.criminalRaidBonus || 0) + (warnings?.raidRequirementReduction || 0);
  const scottishScoutBonus = 0 + (warnings?.scottishRaidBonus || 0) + (warnings?.raidRequirementReduction || 0);
  const baseDefense = calculateDefenseRating(military, forgeBonus + drillBonus);
  const criminalDefense = calculateDefenseRating(military, forgeBonus + drillBonus + criminalScoutBonus);
  const scottishDefense = calculateDefenseRating(military, forgeBonus + drillBonus + scottishScoutBonus);
  return { military, garrison, forgeBonus, drillBonus, criminalScoutBonus, scottishScoutBonus,
    baseDefense, criminalDefense, scottishDefense,
    criminalDefended: criminalDefense >= CRIMINAL_DEFENSE_THRESHOLD,
    scottishDefended: scottishDefense >= SCOTTISH_DEFENSE_THRESHOLD,
    moraleLevel: getMoraleLevel(military.morale) };
}
