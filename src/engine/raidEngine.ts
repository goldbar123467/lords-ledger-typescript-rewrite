/**
 * raidEngine.ts
 *
 * Pure functions for the raid system. No side effects, no I/O.
 * Random draws come from the saved game's stream.
 */

import { RAID_TYPES, TRADE_GOODS_FOR_RAIDS } from "../data/raids.js";

export type RaidType = keyof typeof RAID_TYPES;
export type RandomSource = () => number;

export interface RaidResult {
  victory: boolean;
  partial: boolean;
  defenseRatio: number;
  denariiDelta: number;
  foodDelta: number;
  populationDelta: number;
  garrisonDelta: number;
  tradeGoodLost: { resource: string; amount: number } | null;
  narrativeLine: string;
  raidName: string;
}

export interface RaidState {
  lastRaidTurn: number;
  lastRaidType: RaidType | null;
  criminalCooldown: number;
  scottishCooldown: number;
  totalCriminalRaids: number;
  totalScottishRaids: number;
  criminalVictories: number;
  scottishVictories: number;
  criminalDefeats: number;
  scottishDefeats: number;
  totalDenariiLost: number;
  totalFoodLost: number;
  totalDenariiRecovered: number;
  criminalScribesNoteSeen: boolean;
  scottishScribesNoteSeen: boolean;
  activeRaid: ActiveRaid | null;
}

export type ActiveRaid =
  | { type: RaidType; phase: 'warning'; result?: null;
      drillBonus?: number; defenseRating?: number }
  | { type: RaidType; phase: 'result'; result: RaidResult;
      defenseRating: number; defenseThreshold: number; watchtowerBonus: number; drillBonus?: number };

function sample(random: RandomSource): number {
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError('Raid random draw must be finite and in [0, 1).');
  }
  return draw;
}

function isRaidType(value: string): value is RaidType {
  return value === 'criminal' || value === 'scottish';
}

/**
 * Pick a random integer between min and max (inclusive).
 */
function randInt(min: number, max: number, random: RandomSource) {
  return Math.floor(sample(random) * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: readonly T[] | null | undefined, random: RandomSource): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(sample(random) * arr.length)] ?? null;
}

/**
 * Initial raid state for a new game.
 */
export function getInitialRaidState(): RaidState {
  return {
    lastRaidTurn: 0,
    lastRaidType: null,
    criminalCooldown: 0,
    scottishCooldown: 0,
    totalCriminalRaids: 0,
    totalScottishRaids: 0,
    criminalVictories: 0,
    scottishVictories: 0,
    criminalDefeats: 0,
    scottishDefeats: 0,
    totalDenariiLost: 0,
    totalFoodLost: 0,
    totalDenariiRecovered: 0,
    criminalScribesNoteSeen: false,
    scottishScribesNoteSeen: false,
    activeRaid: null,
  };
}

/** Check whether a raid triggers this season; a forced border raid takes priority. */
export function checkForRaid(raids: Pick<RaidState, 'criminalCooldown' | 'scottishCooldown' | 'lastRaidTurn' | 'totalScottishRaids'> | null, turn: number, random: RandomSource): { type: RaidType } | null {
  if (!raids) return null;

  const criminalDef = RAID_TYPES.criminal;
  const scottishDef = RAID_TYPES.scottish;

  // Decrement cooldowns (already done before this call in reducer)
  const crimCd = raids.criminalCooldown || 0;
  const scotCd = raids.scottishCooldown || 0;

  // Forced Scottish raid if none has fired by turn 16 (respects cooldown from any recent raid)
  const lastRaid = raids.lastRaidTurn || 0;
  if (turn >= scottishDef.forceTurn && (raids.totalScottishRaids || 0) === 0 && scotCd <= 0 && (turn - lastRaid) >= 2) {
    return { type: "scottish" };
  }

  // Criminal check: triggers every triggerInterval turns at baseChance
  let criminalTriggered = false;
  if (turn >= criminalDef.firstPossibleTurn && crimCd <= 0) {
    if ((turn - criminalDef.firstPossibleTurn) % criminalDef.triggerInterval === 0) {
      criminalTriggered = sample(random) < criminalDef.baseChance;
    }
  }

  // Scottish check: triggers every triggerInterval turns at baseChance
  let scottishTriggered = false;
  if (turn >= scottishDef.firstPossibleTurn && scotCd <= 0) {
    if ((turn - scottishDef.firstPossibleTurn) % scottishDef.triggerInterval === 0) {
      scottishTriggered = sample(random) < scottishDef.baseChance;
    }
  }

  // Cannot stack — criminal check first, Scottish only if no criminal
  if (criminalTriggered && scottishTriggered) {
    // Only one fires — prefer Scottish since it's rarer
    return { type: "scottish" };
  }
  if (criminalTriggered) return { type: "criminal" };
  if (scottishTriggered) return { type: "scottish" };

  return null;
}

/** Resolve gains and losses from a defense rating against the threat threshold. */
export function resolveRaid(raidType: string, defenseRating: number, defenseThreshold: number, garrison: number, castleLevel: number, inventory: Readonly<Record<string, number>>, difficulty: 'easy' | 'normal' | 'hard', random: RandomSource): RaidResult | null {
  const difficultyScale = difficulty === "easy" ? 0.5 : difficulty === "hard" ? 1.5 : 1.0;
  if (!isRaidType(raidType)) return null;
  const def = RAID_TYPES[raidType];

  const raidName = pickRandom(def.names, random) ?? '';

  // VICTORY — defense rating meets or exceeds threshold
  if (defenseRating >= defenseThreshold) {
    const gains = def.gains;
    // Keep the legacy draw count stable even when fortifications need their own line.
    const victoryLine = pickRandom(def.victoryLines, random) ?? '';
    return {
      victory: true,
      partial: false,
      defenseRatio: 1,
      denariiDelta: gains.denarii,
      foodDelta: 'food' in gains ? gains.food : 0,
      populationDelta: gains.populationGain || 0,
      garrisonDelta: gains.garrisonGain || 0,
      tradeGoodLost: null,
      narrativeLine: garrison === 0
        ? def.fortificationVictoryLine
        : victoryLine,
      raidName,
    };
  }

  // DEFEAT — calculate losses based on how close defense was
  const defenseRatio = (defenseRating > 0 && defenseThreshold > 0)
    ? Math.min(1, defenseRating / defenseThreshold)
    : 0;
  const lossMultiplier = Math.max(0, 1 - defenseRatio);

  const losses = def.losses;

  // Denarii loss
  let baseDenLoss;
  if (garrison === 0) {
    baseDenLoss = losses.denariiMax;
  } else {
    baseDenLoss = randInt(losses.denariiMin, losses.denariiMax, random);
  }
  const denariiLoss = Math.round(baseDenLoss * lossMultiplier * difficultyScale);

  // Food loss
  let baseFoodLoss;
  if (garrison === 0) {
    baseFoodLoss = losses.foodMax;
  } else {
    baseFoodLoss = randInt(losses.foodMin, losses.foodMax, random);
  }
  const foodLoss = Math.round(baseFoodLoss * lossMultiplier * difficultyScale);

  // Population loss — capped at 25% of current population in reducer to prevent wipeouts
  let popLoss = Math.round((losses.populationLoss || 0) * lossMultiplier * difficultyScale);
  if (garrison === 0) {
    popLoss += Math.round(3 * difficultyScale); // Penalty for zero garrison
  }

  // Garrison loss (Scottish only)
  let garrisonLoss = 0;
  if ('garrisonLossMin' in losses) {
    garrisonLoss = Math.min(
      garrison,
      Math.round(randInt(losses.garrisonLossMin, losses.garrisonLossMax, random) * lossMultiplier)
    );
  }

  // No-castle extra damage (Scottish)
  let extraDenLoss = 0;
  if (castleLevel === 0 && 'noCastleExtraDenarii' in losses && losses.noCastleExtraDenarii) {
    extraDenLoss = losses.noCastleExtraDenarii;
  }

  // Trade good loss
  let tradeGoodLost = null;
  const availableGoods = TRADE_GOODS_FOR_RAIDS.filter((g) => (inventory[g] || 0) > 0);
  if (availableGoods.length > 0) {
    const targetGood = pickRandom(availableGoods, random);
    if (targetGood === null) throw new Error('Available raid trade good could not be selected.');
    const qty = inventory[targetGood] || 0;
    const amount = typeof losses.tradeGoodCount === 'number'
      ? Math.min(losses.tradeGoodCount, qty)
      : qty;
    tradeGoodLost = { resource: targetGood, amount };
  }

  const partial = defenseRating > 0 && defenseRating < defenseThreshold;

  // Narrative line
  let narrativeLine;
  if (garrison === 0) {
    narrativeLine = partial ? def.partialZeroGarrisonLine : def.zeroGarrisonLine;
  } else {
    narrativeLine = pickRandom(def.defeatLines, random) ?? '';
  }

  return {
    victory: false,
    partial,
    defenseRatio,
    denariiDelta: -(denariiLoss + extraDenLoss),
    foodDelta: -foodLoss,
    populationDelta: -popLoss,
    garrisonDelta: garrisonLoss === 0 ? 0 : -garrisonLoss,
    tradeGoodLost,
    narrativeLine,
    raidName,
  };
}

/**
 * Build chronicle text for a raid outcome.
 */
export function buildRaidChronicleText(raidType: RaidType, result: RaidResult, season: string, year: number, garrison: number, defenseRating: number, defenseThreshold: number, watchtowerBonus: number): string {
  if (result.victory) {
    const wtNote = watchtowerBonus > 0 ? `, watchtower intel +${watchtowerBonus}` : "";
    const parts = [`${result.raidName} attacked the estate. Your defenses held (rating ${defenseRating} vs ${defenseThreshold} required${wtNote}).`];
    if (result.denariiDelta > 0) parts.push(`Recovered ${result.denariiDelta}d in plunder`);
    if (result.foodDelta > 0) parts.push(`${result.foodDelta} food in captured supplies`);
    parts.push("The people celebrate.");
    return parts.join(". ");
  }

  // Defeat
  const parts = [`${result.raidName} raided the estate.`];
  if (garrison > 0) {
    const wtNote = watchtowerBonus > 0 ? `, watchtower intel +${watchtowerBonus}` : "";
    parts.push(`Your defenses were insufficient (rating ${defenseRating} vs ${defenseThreshold} required${wtNote}).`);
  } else {
    parts.push("There was no garrison to defend.");
  }
  const lostParts = [];
  if (result.denariiDelta < 0) lostParts.push(`${Math.abs(result.denariiDelta)}d`);
  if (result.foodDelta < 0) lostParts.push(`${Math.abs(result.foodDelta)} food`);
  if (result.tradeGoodLost) lostParts.push(`${result.tradeGoodLost.amount} ${result.tradeGoodLost.resource}`);
  if (result.garrisonDelta < 0) lostParts.push(`${Math.abs(result.garrisonDelta)} soldiers killed`);
  if (lostParts.length > 0) parts.push(`Lost ${lostParts.join(", ")}.`);
  if (result.populationDelta < 0) parts.push(`${Math.abs(result.populationDelta)} families fled in terror.`);
  return parts.join(" ");
}
