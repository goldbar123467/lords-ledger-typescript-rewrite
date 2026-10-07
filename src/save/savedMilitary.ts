import type { MilitaryDefenseState, MILITARY_SCRIBES_NOTES } from '../data/military.ts';

/** Historical bookkeeping may omit fields or retain null defaults. */
export interface SavedMilitaryState extends MilitaryDefenseState {
  idleSeasons?: number | null;
  totalRecruitmentSpending?: number | null;
  totalUpkeepSpending?: number | null;
  totalFortificationSpending?: number | null;
  soldiersLostToRaids?: number | null;
  soldiersLostToDesertion?: number | null;
  scribesNoteSeen?: Partial<Record<keyof typeof MILITARY_SCRIBES_NOTES, boolean | null>> | null;
  /** Only replaced by a current result; old display metadata is opaque. */
  lastRaidOutcome?: unknown;
}

export function validateMilitaryMetadata(value: Record<string, unknown>): string | null {
  for (const key of ['idleSeasons', 'totalRecruitmentSpending', 'totalUpkeepSpending',
    'totalFortificationSpending', 'soldiersLostToRaids', 'soldiersLostToDesertion']) {
    const count = value[key];
    if (count != null && (typeof count !== 'number' || !Number.isFinite(count))) return `Save military ${key} must be a finite number or null.`;
  }
  const notes = value.scribesNoteSeen;
  if (notes == null) return null;
  if (typeof notes !== 'object' || Array.isArray(notes)) return 'Save military notes are invalid.';
  for (const key of ['feudalObligation', 'castleEvolution', 'militaryMorale'] as const) {
    if (key in notes) {
      const flag: unknown = Reflect.get(notes, key);
      if (flag != null && typeof flag !== 'boolean') return `Save military ${key} note flag must be true, false or null.`;
    }
  }
  return null;
}
