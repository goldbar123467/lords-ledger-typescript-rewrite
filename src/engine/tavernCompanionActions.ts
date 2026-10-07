import type {GameSnapshot} from '../save/saveGame.ts';
import type {GameCommand} from './gameCommands.ts';
import {isCompanionContent, nextCompanionContent, type CompanionId} from './tavernCompanion.ts';
import {MARTA_OFFERS, ALDRIC_TRAINING_OFFERS} from '../data/tavern.ts';
import {getTotalFood} from './economyEngine.ts';
import {getInitialMilitaryState, getTotalGarrison} from '../data/military.ts';
import {getRecruitmentCapacity} from '../data/militaryRules.ts';
import {addChronicle} from './chronicle.ts';

const COMPANIONS = {
  marta: {current: 'martaCurrentContent', used: 'martaOffersUsed', advice: 'martaAdviceRemaining',
    stories: 'martaStoriesRemaining', offers: MARTA_OFFERS,
    decline: 'You declined Marta\u2019s trade offer.'},
  aldric: {current: 'aldricCurrentContent', used: 'aldricOffersUsed', advice: 'aldricAdviceRemaining',
    stories: 'aldricStoriesRemaining', offers: ALDRIC_TRAINING_OFFERS,
    decline: 'You declined Aldric\u2019s offer.'},
} as const;

interface OfferSettlement {
  change: Partial<Pick<GameSnapshot, 'denarii' | 'inventory' | 'food' | 'inventoryCapacity' | 'garrison' | 'military' | 'population'>>;
  tavern?: Partial<Pick<GameSnapshot['tavern'], 'martaSpiceInvestment' | 'martaStoragePurchased' | 'aldricDrillActive'>>;
  message: string;
}

/** Distinct authored offer effects; returning null commits neither payment nor resolution. */
function settleOffer(state: GameSnapshot, offerId: string): OfferSettlement | null {
  switch (offerId) {
    case 'bulk_wool': {
      if ((state.inventory?.wool ?? 0) < 5) return null;
      const inventory = {...state.inventory, wool: state.inventory.wool - 5};
      return {change: {denarii: state.denarii + 40, inventory, food: getTotalFood(inventory)},
        message: 'Marta brokered a Flemish wool deal: sold 5 wool for 40d.'};
    }
    case 'spice_investment':
      return state.denarii < 75 ? null : {change: {denarii: state.denarii - 75}, tavern: {martaSpiceInvestment: true},
        message: 'Invested 75d in Marta\u2019s spice shipment. Returns expected next season.'};
    case 'trade_route_tip': {
      if (state.denarii < 30) return null;
      let bestGood = 'cloth', bestPrice = 0;
      for (const good of ['wool', 'cloth', 'honey', 'herbs', 'ale'] as const) {
        const price = state.marketPrices?.sell?.[good] ?? 0;
        if (price > bestPrice) {bestPrice = price; bestGood = good;}
      }
      return {change: {denarii: state.denarii - 30},
        message: `Marta whispers: "${bestGood.charAt(0).toUpperCase() + bestGood.slice(1)} fetches ${bestPrice}d at market right now. Best rate I\u2019ve seen."`};
    }
    case 'storage_deal':
      return state.denarii < 50 || state.tavern?.martaStoragePurchased ? null : {
        change: {denarii: state.denarii - 50, inventoryCapacity: (state.inventoryCapacity ?? 300) + 20},
        tavern: {martaStoragePurchased: true}, message: 'Marta arranged storage expansion. Inventory capacity +20.'};
    case 'basic_drill':
      return state.denarii < 30 || (state.garrison ?? 0) === 0 ? null : {
        change: {denarii: state.denarii - 30}, tavern: {aldricDrillActive: 3},
        message: 'Old Aldric drilled the garrison. Defense readiness improved for 3 seasons.'};
    case 'wall_inspection': {
      if (state.denarii < 20) return null;
      const garrison = state.garrison ?? 0, castle = state.castleLevel ?? 1, defenses = (state.defenseUpgrades ?? []).length;
      const message = castle === 1 && garrison < 5
        ? 'Aldric\u2019s report: Your defenses are dire. A wooden palisade and fewer than 5 men? Upgrade your castle and recruit immediately.'
        : castle < 3 && defenses === 0
          ? 'Aldric\u2019s report: Stone walls would serve you better, and you\u2019ve no defensive installations. Consider a moat or arrow slits.'
          : garrison < 8
            ? 'Aldric\u2019s report: Your walls are adequate, but you need more men. A castle without soldiers is just an expensive barn.'
            : 'Aldric\u2019s report: Your defenses are sound. Maintain garrison strength and upgrade when resources allow.';
      return {change: {denarii: state.denarii - 20}, message};
    }
    case 'recruit_referral': {
      if (state.denarii < 40 || getRecruitmentCapacity(state, 'menAtArms') < 1) return null;
      const military = state.military ?? getInitialMilitaryState(state.garrison ?? 0);
      const garrison = {...military.garrison, menAtArms: (military.garrison.menAtArms || 0) + 1};
      return {change: {denarii: state.denarii - 40, garrison: getTotalGarrison(garrison), military: {...military, garrison}},
        message: 'Aldric recruited a seasoned man-at-arms for the garrison.'};
    }
    case 'war_story_lesson':
      return (state.garrison ?? 0) === 0 ? null : {change: {population: state.population + 2},
        message: 'Aldric told war stories to the garrison. Morale spread through the village. Population +2.'};
    default: return null;
  }
}

function nextContent(state: GameSnapshot, kind: CompanionId, random: () => number) {
  if (state.phase !== 'management') return state;
  const fields = COMPANIONS[kind], tavern = state.tavern ?? {}, current = tavern[fields.current];
  if (current?.type === 'offer' && current.resolution === null && fields.offers.find(offer => offer.id === current.offerId)?.canAccept(state)) return state;
  const next = nextCompanionContent(kind, random, tavern[fields.used] ?? [], tavern[fields.advice] ?? [], tavern[fields.stories] ?? []);
  return next ? {...state, tavern: {...tavern, [fields.current]: next.content,
    [fields.advice]: next.adviceRemaining, [fields.stories]: next.storiesRemaining}} : state;
}

function resolveOffer(state: GameSnapshot, kind: CompanionId, offerId: string, resolution: 'accepted' | 'declined') {
  if (state.phase !== 'management') return state;
  const fields = COMPANIONS[kind], tavern = state.tavern ?? {}, current = tavern[fields.current], used = tavern[fields.used] ?? [];
  if (!isCompanionContent(kind, current) || current?.type !== 'offer' || current.offerId !== offerId || current.resolution !== null || used.includes(offerId)) return state;
  const settlement: OfferSettlement | null = resolution === 'accepted' ? settleOffer(state, offerId) : {change: {}, message: fields.decline};
  if (!settlement) return state;
  const updatedTavern: GameSnapshot['tavern'] = {...tavern, [fields.used]: [...used, offerId],
    [fields.current]: {...current, resolution}, ...settlement.tavern};
  return {...state, ...settlement.change, tavern: updatedTavern,
    chronicle: addChronicle(state.chronicle, settlement.message, state.season, state.year, state.turn, 'action')};
}

/** Companion lifecycle ownership stays inside the pure simulation, with explicit draws. */
export function reduceCompanionAction(state: GameSnapshot, action: GameCommand, random: () => number): GameSnapshot {
  switch (action.type) {
    case 'TAVERN_MARTA_NEXT': return nextContent(state, 'marta', random);
    case 'TAVERN_ALDRIC_NEXT': return nextContent(state, 'aldric', random);
    case 'TAVERN_MARTA_SCRIBES_NOTE_SEEN': return {...state, tavern: {...state.tavern, martaScribesNoteSeen: true}};
    case 'TAVERN_ALDRIC_SCRIBES_NOTE_SEEN': return {...state, tavern: {...state.tavern, aldricScribesNoteSeen: true}};
    case 'TAVERN_MARTA_ACCEPT_OFFER': return resolveOffer(state, 'marta', action.payload?.offerId, 'accepted');
    case 'TAVERN_MARTA_DECLINE_OFFER': return resolveOffer(state, 'marta', action.payload?.offerId, 'declined');
    case 'TAVERN_ALDRIC_ACCEPT_OFFER': return resolveOffer(state, 'aldric', action.payload?.offerId, 'accepted');
    case 'TAVERN_ALDRIC_DECLINE_OFFER': return resolveOffer(state, 'aldric', action.payload?.offerId, 'declined');
    default: return state;
  }
}
