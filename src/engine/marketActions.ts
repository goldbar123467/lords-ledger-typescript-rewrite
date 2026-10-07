import type {GameSnapshot} from '../save/saveGame.ts';
import type {GameCommand} from './gameCommands.ts';
import {BASE_BUY_PRICES, BASE_SELL_PRICES, type ResourceId} from '../data/economy.ts';
import {HAGGLE_CONFIG, REPUTATION_CONFIG, LOCAL_MERCHANTS, FOREIGN_TRADERS} from '../data/market.ts';
import {getTotalFood} from './economyEngine.ts';
import {addChronicle} from './chronicle.ts';
import {isPositivePrice, isPositiveQuantity} from './transactionValidation.ts';
import {remainingMarketSupply, consumeMarketSupply} from './marketSupply.ts';
import {
  haggleMerchant, isActiveHaggle, isHaggleCounterPrice, isMarketReputation,
  marketSaleProceeds, marketQuickSalePrice, marketTradePrice, openingHaggleOffer,
  type HaggleMode,
} from './marketHaggle.ts';

// Posted labels deliberately differ from negotiated labels for merchant-only purchases.
const SELL_LABELS: Partial<Record<ResourceId, string>> = {
  grain: 'Grain', livestock: 'Livestock', fish: 'Fish', timber: 'Timber', clay: 'Clay',
  iron: 'Iron', stone: 'Stone', wool: 'Wool', cloth: 'Cloth', honey: 'Honey', herbs: 'Herbs', ale: 'Ale',
};
const BUY_LABELS: Partial<Record<ResourceId, string>> = {
  grain: 'Grain', livestock: 'Livestock', fish: 'Fish', timber: 'Timber', clay: 'Clay',
  iron: 'Iron', stone: 'Stone', salt: 'Salt', tools: 'Tools', spices: 'Spices',
};
const HAGGLE_LABELS = {...SELL_LABELS, ...BUY_LABELS};

/** The first spice unit in a year gives 3 faith, the next two give 1 each. */
function spiceFaithGain(previous: number, quantity: number) {
  let gain = 0;
  for (let index = 0; index < quantity; index++) {
    const count = previous + index;
    if (count < 1) gain += 3;
    else if (count < 3) gain += 1;
  }
  return gain;
}

/** Commit a validated fill atomically; posted callers cap quantities, bargains require exact fills. */
function settleTrade(
  state: GameSnapshot, mode: HaggleMode, resource: ResourceId, quantity: number, price: number,
  describe: (total: number) => string,
): {state: GameSnapshot; total: number} | null {
  const available = state.inventory[resource] || 0;
  const total = mode === 'sell' ? marketSaleProceeds(price, quantity, resource, state.blacksmith) : price * quantity;
  const supply = mode === 'buy' ? consumeMarketSupply(state.market, state.turn, resource, quantity) : null;
  if (mode === 'sell' ? available < quantity : !supply || state.denarii < total) return null;
  const inventory = {...state.inventory, [resource]: mode === 'sell' ? available - quantity : available + quantity};
  const previous = state.synergies ?? {};
  const tradeTypes = previous.tradeTypes.includes(resource) ? previous.tradeTypes : [...previous.tradeTypes, resource];
  const synergies = {...previous, ...(mode === 'sell'
    ? {woolTrades: previous.woolTrades + (resource === 'wool' || resource === 'cloth' ? quantity : 0)}
    : {spicePurchases: previous.spicePurchases + (resource === 'spices' ? quantity : 0)}), tradeTypes};
  const chapel = state.chapel ?? {};
  const previousSpices = chapel.spicePurchasesThisYear ?? 0;
  const nextChapel = resource === 'spices' && mode === 'buy' ? {...chapel,
    faith: Math.min(100, Math.max(0, (chapel.faith ?? 50) + spiceFaithGain(previousSpices, quantity))),
    spicePurchasesThisYear: previousSpices + quantity} : chapel;
  return {total, state: {
    ...state, inventory, denarii: state.denarii + (mode === 'sell' ? total : -total),
    food: getTotalFood(inventory), tradeCount: (state.tradeCount || 0) + 1, synergies,
    ...(supply ? {market: {...state.market, supply}, chapel: nextChapel} : {}),
    chronicle: addChronicle(state.chronicle, describe(total), state.season, state.year, state.turn, 'action'),
  }};
}

/** Market command ownership stays inside the simulation; only counter-offers draw randomness. */
export function reduceMarketAction(state: GameSnapshot, action: GameCommand, random: () => number): GameSnapshot {
  if (state.phase !== 'management') return state;
  switch (action.type) {
    case 'SELL_RESOURCE':
    case 'BUY_RESOURCE': {
      const {resource, quantity, merchantId} = action.payload ?? {};
      const mode = action.type === 'SELL_RESOURCE' ? 'sell' : 'buy';
      const bases = mode === 'sell' ? BASE_SELL_PRICES : BASE_BUY_PRICES;
      if (typeof resource !== 'string' || !isPositiveQuantity(quantity) ||
          (merchantId === undefined ? !Object.hasOwn(bases, resource) :
            !haggleMerchant(merchantId, state.season, resource, mode))) return state;
      const price = (mode === 'sell'
        ? marketQuickSalePrice(state.marketPrices, state.season, merchantId, resource, state.synergies?.activated ?? [])
        : marketTradePrice(state.marketPrices, state.season, merchantId, resource, mode)) || 0;
      if (!isPositivePrice(price)) return state;
      const available = state.inventory[resource] || 0;
      if (mode === 'sell' && available <= 0) return state;
      // A whole-unit sell command can exhaust fractional stock from a supported older save.
      const fill = mode === 'sell' ? Math.min(quantity, available)
        : Math.min(quantity, Math.floor(state.denarii / price), remainingMarketSupply(state.market, state.turn, resource));
      if (fill <= 0) return state;
      const label = (mode === 'sell' ? SELL_LABELS : BUY_LABELS)[resource] || resource;
      return settleTrade(state, mode, resource, fill, price,
        total => `${mode === 'sell' ? 'Sold' : 'Bought'} ${fill} ${label} for ${total}d.`)?.state ?? state;
    }
    case 'HAGGLE_START': {
      const {merchantId, resource, quantity, mode} = action.payload ?? {};
      if (!isMarketReputation(state.market?.reputation) || state.market?.activeHaggle ||
          state.market?.activeMarketEvent?.effect?.noHaggling) return state;
      if (!isPositiveQuantity(quantity) || typeof resource !== 'string' ||
          (mode !== 'sell' && mode !== 'buy') || quantity > 1_000_000) return state;
      const merchant = haggleMerchant(merchantId, state.season, resource, mode);
      if (!merchant) return state;
      const fairPrice = marketTradePrice(state.marketPrices, state.season, merchantId, resource, mode);
      if (!Number.isSafeInteger(fairPrice) || !isPositivePrice(fairPrice)) return state;
      if (mode === 'buy' && (quantity > Math.floor(state.denarii / fairPrice) ||
          quantity > remainingMarketSupply(state.market, state.turn, resource))) return state;
      const reputation = state.market?.reputation?.[merchantId] ?? 50;
      const currentOffer = openingHaggleOffer(fairPrice, merchant.difficulty, mode, reputation);
      const fill = Math.min(quantity, mode === 'sell' ? (state.inventory[resource] || 0) : quantity);
      if (fill <= 0) return state;
      return {...state, market: {...state.market, activeHaggle: {
        merchantId, mode, resource, quantity: fill, fairPrice, currentOffer, playerCounter: null,
        round: 1, maxRounds: HAGGLE_CONFIG.maxRounds, difficulty: merchant.difficulty, status: 'open',
      }}};
    }
    case 'HAGGLE_COUNTER': {
      const {counterPrice} = action.payload ?? {};
      const haggle = state.market?.activeHaggle;
      if (!haggle || haggle.status !== 'open' ||
          !isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation) ||
          !isHaggleCounterPrice(counterPrice, haggle.fairPrice, haggle.mode)) return state;
      const {fairPrice, currentOffer, round, maxRounds, difficulty, mode} = haggle;
      const difference = mode === 'sell' ? (counterPrice - fairPrice) / fairPrice : (fairPrice - counterPrice) / fairPrice;
      const chances = HAGGLE_CONFIG.acceptChance[difficulty] || HAGGLE_CONFIG.acceptChance.medium;
      const probability = difference <= 0.10 ? chances.withinTenPercent
        : difference <= 0.20 ? chances.withinTwenty : chances.aboveMarket;
      if (random() < probability) return {...state, market: {...state.market,
        activeHaggle: {...haggle, currentOffer: counterPrice, playerCounter: counterPrice, status: 'accepted', round}}};
      const step = HAGGLE_CONFIG.counterStep[difficulty] || 0.5;
      const nextOffer = mode === 'sell'
        ? Math.max(1, Math.round(currentOffer + (counterPrice - currentOffer) * step))
        : Math.max(1, Math.round(currentOffer - (currentOffer - counterPrice) * step));
      const nextRound = round + 1;
      return {...state, market: {...state.market, activeHaggle: {...haggle,
        currentOffer: nextOffer, playerCounter: counterPrice, round: nextRound,
        status: nextRound >= maxRounds ? 'final' : 'open'}}};
    }
    case 'HAGGLE_ACCEPT': {
      const haggle = state.market?.activeHaggle;
      if (!haggle || !isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation)) return state;
      const {merchantId, mode, resource, quantity, currentOffer, fairPrice} = haggle;
      if (!isPositiveQuantity(quantity) || !isPositivePrice(currentOffer) || !isPositivePrice(fairPrice) ||
          typeof resource !== 'string' || (mode !== 'sell' && mode !== 'buy')) return state;
      const name = LOCAL_MERCHANTS.find(merchant => merchant.id === merchantId)?.name ||
        FOREIGN_TRADERS[state.season]?.name || 'a merchant';
      const label = HAGGLE_LABELS[resource] || resource;
      const settled = settleTrade(state, mode, resource, quantity, currentOffer, total =>
        `${mode === 'sell' ? 'Sold' : 'Bought'} ${quantity} ${label} ${mode === 'sell' ? 'to' : 'from'} ${name} for ${total}d (haggled from ${fairPrice}d each).`);
      if (!settled) return state;
      const previous = state.market ?? {};
      const won = mode === 'sell' ? currentOffer >= fairPrice * 0.9 : currentOffer <= fairPrice * 1.1;
      const fair = Math.abs(currentOffer - fairPrice) / fairPrice <= 0.1;
      let change = REPUTATION_CONFIG.anyDeal;
      if (fair) change += REPUTATION_CONFIG.fairDeal;
      if (haggle.round === 1) change += REPUTATION_CONFIG.quickAccept;
      const reputation = Math.max(REPUTATION_CONFIG.min,
        Math.min(REPUTATION_CONFIG.max, (previous.reputation?.[merchantId] ?? 50) + change));
      return {...settled.state, market: {
        ...previous, ...settled.state.market, activeHaggle: null,
        reputation: {...previous.reputation, [merchantId]: reputation},
        tradesThisSeason: (previous.tradesThisSeason || 0) + 1,
        totalTradesLifetime: (previous.totalTradesLifetime || 0) + 1,
        totalHagglesWon: (previous.totalHagglesWon || 0) + (won ? 1 : 0),
        totalHagglesLost: (previous.totalHagglesLost || 0) + (won ? 0 : 1),
        denariiEarnedFromTrade: (previous.denariiEarnedFromTrade || 0) + (mode === 'sell' ? settled.total : 0),
        denariiSpentOnTrade: (previous.denariiSpentOnTrade || 0) + (mode === 'buy' ? settled.total : 0),
        haggleTradesUsed: (previous.haggleTradesUsed || 0) + 1,
        lastTradedSeason: {...(previous.lastTradedSeason ?? {}), [merchantId]: state.turn},
      }};
    }
    case 'HAGGLE_WALK_AWAY': {
      const haggle = state.market?.activeHaggle;
      if (!haggle || !isActiveHaggle(haggle, state.season, state.marketPrices, state.market?.reputation)) return state;
      const {merchantId} = haggle;
      const previous = state.market ?? {};
      const reputation = Math.max(REPUTATION_CONFIG.min,
        (previous.reputation?.[merchantId] ?? 50) + REPUTATION_CONFIG.walkAway);
      return {...state, market: {...previous, activeHaggle: null,
        reputation: {...previous.reputation, [merchantId]: reputation}},
      chronicle: addChronicle(state.chronicle, 'You walked away from a deal at the market.', state.season, state.year, state.turn, 'action')};
    }
    default: return state;
  }
}
