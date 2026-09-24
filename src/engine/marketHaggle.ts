/** A pending market bargain is executable only for an offered good at a bounded price. */
import { BASE_BUY_PRICES, BASE_SELL_PRICES } from '../data/economy.ts';
import { FOREIGN_TRADERS, HAGGLE_CONFIG, LOCAL_MERCHANTS, getReputationTier } from '../data/market.ts';
import { SYNERGY_PATH_LIST, SYNERGY_TIER_MAP } from '../data/synergies.ts';
import { getSynergyTradePriceBonus, getSynergyWoolSellBonus } from './synergyEngine.ts';

export type HaggleMode = 'buy' | 'sell';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** All saved merchant relationships must remain usable even when no deal is pending. */
export function isMarketReputation(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(reputation =>
    typeof reputation === 'number' && Number.isFinite(reputation) &&
    reputation >= 0 && reputation <= 100);
}

export function isActivatedSynergies(value: unknown): value is string[] {
  if (!Array.isArray(value) ||
      !value.every((id: unknown) => typeof id === 'string' && Object.hasOwn(SYNERGY_TIER_MAP, id)) ||
      new Set(value).size !== value.length) return false;
  const active = new Set<string>(value);
  for (const path of SYNERGY_PATH_LIST) {
    let missingEarlierTier = false;
    for (const tier of path.tiers) {
      if (!active.has(tier.id)) missingEarlierTier = true;
      else if (missingEarlierTier) return false;
    }
  }
  return true;
}

/** Seasonal prices are rounded draws from each authored base price at ±20%. */
export function isGeneratedMarketPrices(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const [sideName, bases] of [
    ['sell', BASE_SELL_PRICES], ['buy', BASE_BUY_PRICES],
  ] as const) {
    const side = value[sideName];
    const entries = Object.entries(bases);
    if (!isRecord(side) || Object.keys(side).length !== entries.length) return false;
    for (const [resource, base] of entries) {
      const price = side[resource];
      if (!isPrice(price) || price < Math.max(1, Math.round(base * 0.8)) ||
          price > Math.max(1, Math.round(base * 1.2))) return false;
    }
  }
  return true;
}

export function haggleMerchant(
  merchantId: unknown, season: unknown, resource: unknown, mode: unknown,
): { difficulty: 'easy' | 'medium' | 'hard' } | null {
  if (typeof merchantId !== 'string' || typeof resource !== 'string' ||
      (mode !== 'buy' && mode !== 'sell')) return null;
  if (!Object.hasOwn(BASE_SELL_PRICES, resource) &&
      !Object.hasOwn(BASE_BUY_PRICES, resource)) return null;
  const local = LOCAL_MERCHANTS.find(merchant => merchant.id === merchantId);
  if (local) {
    const offered = mode === 'buy' ? local.sells : local.buys;
    const difficulty = local.haggleDifficulty;
    if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') return null;
    return offered.some(offeredResource => offeredResource === resource) ? { difficulty } : null;
  }
  const foreign = Object.entries(FOREIGN_TRADERS)
    .find(([traderSeason]) => traderSeason === season)?.[1];
  if (foreign?.id !== merchantId) return null;
  const offered = mode === 'buy' ? foreign.sellsExclusive : foreign.buysAtPremium;
  if (!offered.some(offeredResource => offeredResource === resource)) return null;
  return { difficulty: 'medium' };
}

/** Missing buy quotes for authored trade goods derive from that season's sell quote. */
export function marketTradePrice(
  marketPrices: unknown, season: unknown, merchantId: unknown,
  resource: unknown, mode: unknown,
): number | null {
  if (!isRecord(marketPrices) || typeof resource !== 'string' ||
      (mode !== 'buy' && mode !== 'sell')) return null;
  if (merchantId !== undefined && !haggleMerchant(merchantId, season, resource, mode)) return null;
  const sell = marketPrices.sell;
  const buy = marketPrices.buy;
  if (!isRecord(sell) || !isRecord(buy)) return null;
  if (mode === 'buy') {
    const directBuy = buy[resource];
    if (isPrice(directBuy) && Object.hasOwn(BASE_BUY_PRICES, resource)) return directBuy;
    const seasonalSell = sell[resource];
    if (merchantId !== undefined && Object.hasOwn(BASE_SELL_PRICES, resource) &&
        isPrice(seasonalSell)) return Math.max(1, Math.round(seasonalSell * 1.5));
    return null;
  }
  const basePrice = sell[resource];
  if (!isPrice(basePrice) || !Object.hasOwn(BASE_SELL_PRICES, resource)) return null;
  const foreign = Object.entries(FOREIGN_TRADERS)
    .find(([traderSeason]) => traderSeason === season)?.[1];
  if (foreign && foreign.id === merchantId &&
      foreign.buysAtPremium.some(offeredResource => offeredResource === resource)) {
    return Math.max(1, Math.round(basePrice * (1 + foreign.premiumPercent / 100)));
  }
  return basePrice;
}

/** Posted quick-sale proceeds include earned bonuses; a haggle starts at the seasonal quote. */
export function marketQuickSalePrice(
  marketPrices: unknown, season: unknown, merchantId: unknown,
  resource: unknown, activated: unknown,
): number | null {
  const quote = marketTradePrice(marketPrices, season, merchantId, resource, 'sell');
  if (quote === null || typeof resource !== 'string' || !isActivatedSynergies(activated)) return null;
  return quote + getSynergyTradePriceBonus(activated) +
    (resource === 'wool' || resource === 'cloth' ? getSynergyWoolSellBonus(activated) : 0);
}

export function hagglePriceRange(fairPrice: number, mode: HaggleMode): { min: number; max: number } {
  return {
    min: Math.max(1, Math.round(fairPrice * 0.5)),
    max: Math.max(1, Math.round(fairPrice * (mode === 'sell' ? 1.1 : 1.5))),
  };
}

export function isHaggleCounterPrice(value: unknown, fairPrice: number, mode: HaggleMode): value is number {
  if (!isPrice(value) || !isPrice(fairPrice)) return false;
  const { min, max } = hagglePriceRange(fairPrice, mode);
  return value >= min && value <= max;
}

export function openingHaggleOffer(
  fairPrice: number, difficulty: 'easy' | 'medium' | 'hard', mode: HaggleMode,
  reputation: number,
): number {
  const openingPct = HAGGLE_CONFIG.openingOffer[difficulty];
  const repMod = getReputationTier(reputation)?.effect ?? 0;
  return Math.max(1, Math.round(fairPrice * (mode === 'sell'
    ? openingPct + repMod
    : 2 - openingPct - repMod)));
}

/** Validate the terms a save or direct action could otherwise turn into a trade. */
export function isActiveHaggle(
  value: unknown, season: unknown, marketPrices: unknown, reputations: unknown,
): boolean {
  if (!isRecord(value) || !isRecord(marketPrices) || typeof value.merchantId !== 'string' ||
      typeof value.resource !== 'string' ||
      typeof value.status !== 'string' ||
      (value.mode !== 'buy' && value.mode !== 'sell')) return false;
  const merchant = haggleMerchant(value.merchantId, season, value.resource, value.mode);
  if (!merchant || !isPrice(value.fairPrice) ||
      marketTradePrice(marketPrices, season, value.merchantId, value.resource, value.mode) !== value.fairPrice ||
      value.difficulty !== merchant.difficulty ||
      !Number.isSafeInteger(value.quantity) || typeof value.quantity !== 'number' ||
      value.quantity <= 0 || value.quantity > 1_000_000 ||
      value.maxRounds !== HAGGLE_CONFIG.maxRounds ||
      !Number.isSafeInteger(value.round) || typeof value.round !== 'number' ||
      value.round < 1 || value.round > HAGGLE_CONFIG.maxRounds ||
      !['open', 'accepted', 'final'].includes(value.status)) return false;
  if (value.status === 'final' && value.round !== HAGGLE_CONFIG.maxRounds) return false;
  if (value.status === 'open' && value.round >= HAGGLE_CONFIG.maxRounds) return false;
  if ((value.round > 1 || value.status !== 'open') && value.playerCounter === null) return false;
  if (value.status === 'accepted' && value.currentOffer !== value.playerCounter) return false;
  const { min, max } = hagglePriceRange(value.fairPrice, value.mode);
  if (!isPrice(value.currentOffer) || value.currentOffer < min || value.currentOffer > max) return false;
  if (value.playerCounter !== null &&
      !isHaggleCounterPrice(value.playerCounter, value.fairPrice, value.mode)) return false;
  const savedRep = isRecord(reputations) ? reputations[value.merchantId] : undefined;
  if (savedRep !== undefined &&
      (typeof savedRep !== 'number' || !Number.isFinite(savedRep) || savedRep < 0 || savedRep > 100)) return false;
  if (value.round === 1 && value.status === 'open') {
    if (value.playerCounter !== null) return false;
    const reputation = typeof savedRep === 'number' ? savedRep : 50;
    if (value.currentOffer !== openingHaggleOffer(value.fairPrice, merchant.difficulty,
      value.mode, reputation)) return false;
  }
  return true;
}
