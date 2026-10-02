/**
 * flipEngine.ts
 *
 * Pure functions for perspective-flip logic.
 * No side effects or I/O. Chance-based options consume an explicit random draw.
 */

import { PERSPECTIVE_FLIPS } from "../data/perspectiveFlips.ts";
import { CYOA_FLIPS } from "../data/cyoaFlips.ts";
import { FLIP_STAT_IDS, type FlipDefinition, type FlipEffects, type FlipEnding,
  type FlipOption, type FlipStatId, type FlipStats, type LinearFlip } from "../data/flipTypes.ts";
import { getBuildingType, type BuildingEntry } from "./buildingActions.ts";
import type { TAX_RATES } from "../data/economy.ts";

export type LinearFlipId = keyof typeof PERSPECTIVE_FLIPS;
export type CyoaFlipId = keyof typeof CYOA_FLIPS;
export type FlipId = LinearFlipId | CyoaFlipId;
export const ALL_FLIPS: Record<FlipId, FlipDefinition> = { ...PERSPECTIVE_FLIPS, ...CYOA_FLIPS };
const linearFlips: Record<LinearFlipId, LinearFlip> = PERSPECTIVE_FLIPS;

export function isFlipId(value: unknown): value is FlipId {
  return typeof value === 'string' && Object.hasOwn(ALL_FLIPS, value);
}

function isLinearFlipId(value: unknown): value is LinearFlipId {
  return typeof value === 'string' && Object.hasOwn(linearFlips, value);
}

function isFlipStat(value: string): value is FlipStatId {
  return FLIP_STAT_IDS.some(id => id === value);
}

interface FlipTriggerState {
  turn: number;
  perspectiveFlips?: Partial<Record<FlipId, boolean>>;
  taxRate?: keyof typeof TAX_RATES;
  population?: number;
  buildings?: BuildingEntry[];
  tradeCount?: number;
  castleLevel?: number;
  militaryEventEverFired?: boolean;
  garrison?: number;
  lastFlipTurn?: number;
  denarii?: number;
  chapel?: { faith?: number; piety?: number };
}

/** Priority order for trigger evaluation */
const FLIP_PRIORITY: readonly FlipId[] = [
  "serf_week", "merchant_day", "noble_dilemma", "knight_gamble",
  "cyoa_lord", "cyoa_merchant", "cyoa_monk", "cyoa_knight", "cyoa_serf",
];

/**
 * Checks whether any perspective flip should trigger this turn.
 * Each flip fires once per playthrough (guarded by state.perspectiveFlips[id]).
 *
 * @param {object} state - Game state (must include turn, perspectiveFlips, taxRate,
 *   meters, buildings, tradeCount, castleLevel, militaryEventEverFired, garrison)
 * @returns {string|null} flipId or null
 */
export function checkFlipTriggers(state: FlipTriggerState): FlipId | null {
  const {
    turn,
    perspectiveFlips = {},
    taxRate,
    population = 20,
    buildings = [],
    tradeCount = 0,
    castleLevel = 1,
    militaryEventEverFired = false,
    garrison = 0,
    lastFlipTurn = 0,
    denarii = 0,
    chapel,
  } = state;

  // BUG-24 FIX: Enforce minimum 3-turn cooldown between flips
  if (turn - lastFlipTurn < 3) return null;

  for (const flipId of FLIP_PRIORITY) {
    // Already fired this playthrough
    if (perspectiveFlips[flipId]) continue;

    const flip = ALL_FLIPS[flipId];
    if (!flip) continue;

    // Must meet minimum turn
    if (turn < flip.triggerConditions.minTurn) continue;

    // Check flip-specific conditions (resource-based)
    switch (flipId) {
      case "serf_week":
        if (taxRate === "high" || taxRate === "crushing" || population < 12) {
          return flipId;
        }
        break;

      case "merchant_day":
        if (
          buildings.some((b) => getBuildingType(b) === "brewery") ||
          buildings.some((b) => getBuildingType(b) === "fulling_mill") ||
          tradeCount >= 5
        ) {
          return flipId;
        }
        break;

      case "noble_dilemma":
        if (castleLevel > 1 || militaryEventEverFired) {
          return flipId;
        }
        break;

      case "knight_gamble":
        if (garrison > 15) {
          return flipId;
        }
        break;

      case "cyoa_lord":
        // BUG-24 FIX: Require at least 3 buildings or 300+ denarii
        if (buildings.length >= 3 || denarii >= 300) {
          return flipId;
        }
        break;

      case "cyoa_merchant":
        if (tradeCount >= 3 || buildings.some((b) => getBuildingType(b) === "brewery") || buildings.some((b) => getBuildingType(b) === "fulling_mill")) {
          return flipId;
        }
        break;

      case "cyoa_monk":
        // BUG-24 FIX: Require chapel interaction (faith > 0 or piety > 0)
        if ((chapel?.faith ?? 0) > 0 || (chapel?.piety ?? 0) > 0) {
          return flipId;
        }
        break;

      case "cyoa_knight":
        if (garrison > 5 || militaryEventEverFired) {
          return flipId;
        }
        break;

      case "cyoa_serf":
        if (taxRate === "high" || taxRate === "crushing" || population < 15) {
          return flipId;
        }
        break;
    }
  }

  return null;
}

/**
 * Returns the initial character stats for a flip.
 *
 * @param {string} flipId
 * @returns {{ [statName]: number }}
 */
export function getInitialFlipStats(flipId: string | null | undefined): FlipStats {
  if (!isFlipId(flipId)) return {};
  const flip = ALL_FLIPS[flipId];
  if (!flip) return {};

  // CYOA flips have no character stats
  if (flip.type === "cyoa" || !flip.characterStats) return {};

  const stats: FlipStats = {};
  for (const [key, config] of Object.entries(flip.characterStats)) {
    if (isFlipStat(key)) stats[key] = config.initial;
  }
  return stats;
}

/**
 * Resolves a player's choice on a flip decision option.
 * Deterministic options apply statEffects directly.
 * Chance-based options consume the saved game's random stream.
 *
 * @param {object} option - The chosen option from the decision
 * @param {{ [statName]: number }} currentStats
 * @returns {{ nextStats: object, consequenceFlags: string[], outcome: string, wasSuccess: boolean|null }}
 */
export function resolveFlipOption(option: FlipOption, currentStats: FlipStats, random: () => number): {
  nextStats: FlipStats; consequenceFlags: readonly string[]; outcome: string; wasSuccess: boolean | null;
} {

  // Chance-based option
  if (option.chance !== undefined) {
    const roll = random();
    const success = roll < option.chance;

    const effects = success ? option.successStatEffects : option.failureStatEffects;
    const outcome = success ? option.successOutcome : option.failureOutcome;

    const nextStats = applyStatEffects(currentStats, effects);

    let flags: readonly string[] = [];
    if (option.consequenceFlags) {
      if (isFlagList(option.consequenceFlags)) {
        flags = option.consequenceFlags;
      } else {
        flags = success ? (option.consequenceFlags.success || []) : (option.consequenceFlags.failure || []);
      }
    }

    return { nextStats, consequenceFlags: flags, outcome, wasSuccess: success };
  }

  // Deterministic option
  const nextStats = applyStatEffects(currentStats, option.statEffects);

  const flags = option.consequenceFlags && isFlagList(option.consequenceFlags) ? option.consequenceFlags : [];

  return {
    nextStats,
    consequenceFlags: flags,
    outcome: option.outcome,
    wasSuccess: null,
  };
}

function isFlagList(flags: NonNullable<FlipOption['consequenceFlags']>): flags is readonly string[] {
  return Array.isArray(flags);
}

function applyStatEffects(current: FlipStats, effects: FlipStats): FlipStats {
  const next = { ...current };
  for (const [stat, delta] of Object.entries(effects)) {
    if (!isFlipStat(stat)) continue;
    const value = next[stat];
    if (value !== undefined) next[stat] = Math.min(100, Math.max(0, value + delta));
  }
  return next;
}

/**
 * Returns true if the given flip ID is a CYOA-style flip.
 *
 * @param {string} flipId
 * @returns {boolean}
 */
export function isCyoaFlip(flipId: string | null | undefined): flipId is CyoaFlipId {
  if (!isFlipId(flipId)) return false;
  const flip = ALL_FLIPS[flipId];
  return flip?.type === "cyoa";
}

/**
 * Computes resource consequences for a CYOA flip based on the ending type reached.
 *
 * @param {string} flipId
 * @param {string} endingType - "good" | "medium" | "bad"
 * @returns {{ treasury?: number, people?: number }}
 */
export function computeCyoaConsequences(flipId: string | null | undefined, endingType: FlipEnding | null | undefined): FlipEffects {
  if (!isFlipId(flipId) || !endingType) return {};
  const flip = ALL_FLIPS[flipId];
  if (!flip || flip.type !== "cyoa") return {};
  return flip.consequences?.[endingType] || {};
}

/**
 * Computes the lord-meter consequences from accumulated flip flags.
 * Sums base consequences + all flag-triggered consequences.
 *
 * @param {string} flipId
 * @param {string[]} flags - Accumulated consequence flags from all decisions
 * @returns {{ treasury?: number, people?: number, military?: number, faith?: number }}
 */
export function computeFlipConsequences(flipId: string | null | undefined, flags: readonly string[] = []): FlipEffects {
  if (!isLinearFlipId(flipId)) return {};
  const flip = linearFlips[flipId];
  if (!flip || !flip.consequences) return {};

  const result: FlipEffects = {};

  // Apply base consequences
  for (const [meter, delta] of Object.entries(flip.consequences.base || {})) {
    if (isEffectMeter(meter)) result[meter] = (result[meter] || 0) + delta;
  }

  // Apply flag-triggered consequences (deduplicate flags)
  const uniqueFlags = [...new Set(flags)];
  for (const flag of uniqueFlags) {
    const flagEffects = flip.consequences.flags?.[flag];
    if (flagEffects) {
      for (const [meter, delta] of Object.entries(flagEffects)) {
        if (isEffectMeter(meter)) result[meter] = (result[meter] || 0) + delta;
      }
    }
  }

  return result;
}

function isEffectMeter(value: string): value is keyof FlipEffects {
  return value === 'treasury' || value === 'people' || value === 'military' || value === 'faith';
}
