import {
  SOLDIER_TYPES, MILITARY_SCRIBES_NOTES, canUpgradeFortification,
  getInitialMilitaryState, getTotalGarrison, isSoldierType,
  type MilitaryDefenseState, type MilitaryState, type SoldierType,
  type FortificationTrack, type FortificationLevels,
} from '../data/military.ts';
import { getRecruitmentCapacity } from '../data/militaryRules.ts';
import { isPositiveQuantity } from './transactionValidation.ts';

export type MilitaryAction =
  | { type: 'RECRUIT_SOLDIERS' | 'DISMISS_SOLDIERS'; payload: { count: number; soldierType?: SoldierType } }
  | { type: 'UPGRADE_FORTIFICATION'; payload: { track: FortificationTrack } };

/** Only bookkeeping consumed here is optional at this incremental boundary. */
type CommandMilitaryState = MilitaryDefenseState &
  Partial<Pick<MilitaryState, 'totalRecruitmentSpending' | 'totalFortificationSpending'>> &
  { scribesNoteSeen?: Partial<MilitaryState['scribesNoteSeen']> };

export interface MilitaryCommandState {
  phase: string;
  denarii: number;
  population: number;
  garrison: number;
  castleLevel: FortificationLevels['walls'];
  military?: CommandMilitaryState | null;
  scribesNote?: string | null;
}

interface MilitaryChange {
  patch: {
    military: CommandMilitaryState;
    denarii?: number;
    garrison?: number;
    castleLevel?: FortificationLevels['walls'];
    scribesNote?: string | null;
  };
  chronicleText: string;
}

/** Plans one atomic domain change; the reducer owns calendar/chronicle sequencing. */
export function planMilitaryAction(
  state: MilitaryCommandState, type: MilitaryAction['type'], payload: unknown,
): MilitaryChange | null {
  if (state.phase !== 'management') return null;
  const input = typeof payload === 'object' && payload !== null ? payload : {};
  const mil = state.military ?? getInitialMilitaryState(state.garrison);

  if (type === 'RECRUIT_SOLDIERS' || type === 'DISMISS_SOLDIERS') {
    const count = 'count' in input ? input.count : undefined;
    const suppliedType = 'soldierType' in input ? input.soldierType : undefined;
    const soldierType = suppliedType === undefined ? 'levy' : suppliedType;
    if (!isPositiveQuantity(count) || !isSoldierType(soldierType)) return null;
    const definition = SOLDIER_TYPES[soldierType];
    const recruiting = type === 'RECRUIT_SOLDIERS';
    if (recruiting && soldierType === 'knights' && state.population < SOLDIER_TYPES.knights.minPopulation) return null;
    const current = mil.garrison[soldierType] || 0;
    const actual = recruiting
      ? Math.min(count, Math.floor(state.denarii / definition.recruitCost), getRecruitmentCapacity(state, soldierType))
      : Math.min(count, current);
    if (actual <= 0) return null;
    const cost = actual * definition.recruitCost;
    const garrison = { ...mil.garrison, [soldierType]: current + (recruiting ? actual : -actual) };
    const morale = recruiting
      ? (soldierType === 'knights' ? Math.min(100, (mil.morale || 50) + 5) : mil.morale)
      : Math.max(0, (mil.morale || 50) - 5);
    return {
      patch: {
        ...(recruiting ? { denarii: state.denarii - cost } : {}),
        garrison: getTotalGarrison(garrison),
        military: {
          ...mil, garrison, morale,
          ...(recruiting ? { totalRecruitmentSpending: (mil.totalRecruitmentSpending || 0) + cost } : {}),
        },
      },
      chronicleText: recruiting
        ? `Recruited ${actual} ${definition.name.toLowerCase()} for ${cost}d.`
        : `Dismissed ${actual} ${definition.name.toLowerCase()}.`,
    };
  }

  const track = 'track' in input ? input.track : undefined;
  if (track !== 'walls' && track !== 'gate' && track !== 'moat') return null;
  const upgrade = canUpgradeFortification(track, mil);
  if (!upgrade.canUpgrade || state.denarii < upgrade.next.cost) return null;
  const next = upgrade.next;
  const military: CommandMilitaryState = {
    ...mil, [track]: next.level,
    morale: Math.min(100, (mil.morale || 50) + 10),
    totalFortificationSpending: (mil.totalFortificationSpending || 0) + next.cost,
  };
  let scribesNote: string | null = null;
  if (track === 'walls' && next.level === 2 && !mil.scribesNoteSeen?.castleEvolution) {
    scribesNote = MILITARY_SCRIBES_NOTES.castleEvolution;
    military.scribesNoteSeen = { ...mil.scribesNoteSeen, castleEvolution: true };
  }
  return {
    patch: {
      denarii: state.denarii - next.cost,
      castleLevel: track === 'walls' ? next.level : state.castleLevel,
      military,
      scribesNote: scribesNote || state.scribesNote,
    },
    chronicleText: `Upgraded ${track} to ${next.name} for ${next.cost}d.`,
  };
}
