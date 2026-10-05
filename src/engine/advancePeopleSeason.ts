import { TAX_RATES } from '../data/economy.ts';
import type { EconomySeason } from './foodRequirement.ts';
import {
  LABOR_DEFAULTS, getInitialPeopleState, getInitialTiers, reconcileTiers, computeMorale,
  updateFamilyLoyalty, checkFamilyDepartures, checkFamilyReturns, pickFeedEvents,
  type CompatiblePeopleState, type PeopleState, type TaxRate,
} from '../data/people.ts';

interface PeopleSeasonInput {
  population: number;
  food: number;
  taxRate: TaxRate;
  season: EconomySeason;
  year: number;
  people?: CompatiblePeopleState | null;
}
type SeasonalPeople = CompatiblePeopleState & Pick<PeopleState,
  'tiers' | 'notableFamilies' | 'villageFeed' | 'taxHistory'>;

/** The reducer retains economy ordering, calendar, and chronicle ownership. */
export function advancePeopleSeason(
  state: PeopleSeasonInput, economy: { food: number; population: number }, random: () => number,
): { people: SeasonalPeople; chronicleTexts: string[] } {
  const previous = state.people ?? getInitialPeopleState(state.population);
  const foodBalance = economy.food - state.food;
  const tiers = reconcileTiers(economy.population, previous.tiers ?? getInitialTiers(state.population));
  const morale = computeMorale({ taxRate: state.taxRate, resourceDeltas: { food: foodBalance }, people: previous }).value;
  let families = updateFamilyLoyalty(previous.notableFamilies ?? [], state.taxRate, morale,
    previous.laborGarrison ?? LABOR_DEFAULTS.garrison, previous.laborChurch ?? LABOR_DEFAULTS.church, foodBalance);
  const chronicleTexts: string[] = [];
  for (const id of checkFamilyDepartures(families, morale)) {
    families = families.map(family => {
      if (family.id !== id) return family;
      chronicleTexts.push(family.leaveNarrative || `${family.name} has left.`);
      return { ...family, present: false, turnsGone: 0 };
    });
  }
  for (const id of checkFamilyReturns(families, morale)) {
    families = families.map(family => {
      if (family.id !== id) return family;
      chronicleTexts.push(family.returnNarrative || `${family.name} has returned.`);
      return { ...family, present: true, turnsGone: 0, loyalty: 1 };
    });
  }
  return {
    people: { ...previous, tiers, notableFamilies: families,
      villageFeed: pickFeedEvents(state.season, morale, foodBalance, economy.population, families, random),
      taxHistory: [...(previous.taxHistory ?? []), { season: state.season, year: state.year,
        revenue: state.season === 'autumn' ? economy.population * TAX_RATES[state.taxRate].rate : 0 }].slice(-8),
    },
    chronicleTexts,
  };
}
