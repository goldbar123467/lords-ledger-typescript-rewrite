import {
  DIFFICULTY_CONFIGS,
  FOOD_PER_FAMILY,
  SEASON_CONSUMPTION_MULTIPLIERS,
} from '../data/economy.ts';

export type EconomyDifficulty = keyof typeof DIFFICULTY_CONFIGS;
export type EconomySeason = keyof typeof SEASON_CONSUMPTION_MULTIPLIERS;

/** Family rations are capped by difficulty; soldiers consume food afterward. */
export function getSeasonFoodRequirement(
  population: number,
  garrison: number,
  season: EconomySeason,
  difficulty: EconomyDifficulty,
) {
  const config = DIFFICULTY_CONFIGS[difficulty] ?? DIFFICULTY_CONFIGS.normal;
  const consumptionMultiplier = SEASON_CONSUMPTION_MULTIPLIERS[season] ?? 1;
  const seasonalNeed = Math.ceil(population * FOOD_PER_FAMILY * consumptionMultiplier);
  const maxFoodLoss = Math.max(
    config.foodCapBase,
    Math.ceil(population * FOOD_PER_FAMILY * config.consumptionScale),
  );
  const familyNeed = Math.min(seasonalNeed, maxFoodLoss);
  const garrisonNeed = Math.ceil(garrison / 5);
  return {
    seasonalNeed,
    maxFoodLoss,
    familyNeed,
    garrisonNeed,
    totalNeed: familyNeed + garrisonNeed,
    consumptionMultiplier,
  };
}
