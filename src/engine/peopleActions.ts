import { TAX_RATES } from '../data/economy.ts';
import { getInitialPeopleState, type CompatiblePeopleState, type PeopleState, type TaxRate } from '../data/people.ts';

type LaborAllocation = Pick<PeopleState, 'laborFarming' | 'laborGarrison' | 'laborChurch'>;
export type PeopleAction =
  | { type: 'SET_TAX_RATE'; payload: { rate: TaxRate } }
  | { type: 'PEOPLE_SET_LABOR'; payload: Partial<LaborAllocation> };

export interface PeopleCommandState {
  phase: string;
  population: number;
  people?: CompatiblePeopleState | null;
}
export const LABOR_LIMITS = { laborFarming: 100, laborGarrison: 40, laborChurch: 15 } as const;

export function isLaborPercentage(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}

/** The reducer owns the snapshot; reject an invalid command before any field changes. */
export function planPeopleAction(
  state: PeopleCommandState, type: PeopleAction['type'], payload: unknown,
): { taxRate: TaxRate } | { people: CompatiblePeopleState } | null {
  if (state.phase !== 'management' || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  if (type === 'SET_TAX_RATE') {
    const rate = 'rate' in payload ? payload.rate : undefined;
    if (typeof rate !== 'string' || !Object.hasOwn(TAX_RATES, rate)) return null;
    // The own-key guard refines this external string without a persisted-data cast.
    if (rate !== 'low' && rate !== 'medium' && rate !== 'high' && rate !== 'crushing') return null;
    return { taxRate: rate };
  }
  const farming = 'laborFarming' in payload ? payload.laborFarming : undefined;
  const garrison = 'laborGarrison' in payload ? payload.laborGarrison : undefined;
  const church = 'laborChurch' in payload ? payload.laborChurch : undefined;
  if (farming == null && garrison == null && church == null) return null;
  if ((farming != null && !isLaborPercentage(farming, LABOR_LIMITS.laborFarming)) ||
      (garrison != null && !isLaborPercentage(garrison, LABOR_LIMITS.laborGarrison)) ||
      (church != null && !isLaborPercentage(church, LABOR_LIMITS.laborChurch))) return null;
  const previous = state.people ?? getInitialPeopleState(state.population);
  return { people: { ...previous,
    laborFarming: farming ?? previous.laborFarming,
    laborGarrison: garrison ?? previous.laborGarrison,
    laborChurch: church ?? previous.laborChurch,
  } };
}
