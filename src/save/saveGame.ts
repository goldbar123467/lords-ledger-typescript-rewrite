import {isMarketSupply} from "../engine/marketSupply.ts";
import { validateViewMetadata, type ViewMetadata } from './viewMetadata.ts';
import {isSavedChronicle,type SavedChronicleEntry} from '../engine/chronicle.ts';
import {validateForgeState, type ForgeSaveState} from '../engine/forgeState.ts';
import { validateHallCivicState } from '../engine/hallCivic.ts';
/** Browser storage boundary. The legacy key is read only during explicit import. */
import seasonalEvents from '../data/seasonalEvents.ts';
import randomEvents from '../data/randomEvents.ts';
import type { EventDefinition } from '../data/eventTypes.ts';
import type { SavedEvent } from './savedEvent.ts';
import { validateRaidBookkeeping, type SavedRaidState } from './savedRaid.ts';
import { validateMarketMetadata, type SavedMarketState } from './savedMarket.ts';
import { validateWatchtowerState, type SavedWatchtowerState } from './savedWatchtower.ts';
import { validateSynergyMetadata, type SavedSynergyState } from './savedSynergy.ts';
import { PERSPECTIVE_FLIPS } from '../data/perspectiveFlips.ts';
import { CYOA_FLIPS } from '../data/cyoaFlips.ts';
import { isRandomState, seedLegacySnapshot } from '../engine/random.ts';
import { validateChapelState, restartSavedManuscript, type ChapelSaveState } from '../engine/chapelState.ts';
import { validatePeopleState } from '../engine/peopleState.ts';
import { validateHallAudienceState, validateHallDisputeState, type HallSaveState } from '../engine/hallAudienceState.ts';
import type { CompatiblePeopleState } from '../data/people.ts';
import type { GameOverReason } from '../engine/meterUtils.ts';
import { isGambitWeapon, type GambitWeapon } from '../engine/tavernGambit.ts';
import { MAX_RAT_SPAWNS } from '../engine/ratsInCellar.ts';
import { isTavernLedgerInteger, type TavernLedgerInteger } from '../engine/tavernLedger.ts';
import { isStrangerEncounterType, type StrangerEncounterType } from '../engine/tavernEncounter.ts';
import { isBardContent, isBardSolvedIds, isBardTaleQueue, type BardContent } from '../engine/tavernBard.ts';
import { isCompanionContent, isCompanionOfferIds, isCompanionQueue, type CompanionContent } from '../engine/tavernCompanion.ts';
import { validateHallConsequenceState } from '../engine/hallConsequenceState.ts';
import { validateHallFeastState } from '../engine/feast.ts';
import { isActivatedSynergies, isActiveHaggle, isGeneratedMarketPrices, isMarketReputation } from '../engine/marketHaggle.ts';
import { GAMBIT_MAX_ROUNDS } from '../data/tavern.ts';
import BUILDINGS, { type BuildingId } from '../data/buildings.ts';
import { isFortificationLevel, type MilitaryDefenseState, type FortificationLevels } from '../data/military.ts';
import { ALL_RESOURCES, RESOURCE_CONFIG, TAX_RATES, type GeneratedMarketPrices, type Inventory, type ResourceId as AuthoredResourceId } from '../data/economy.ts';
export type { Inventory } from '../data/economy.ts';

export const SAVE_KEY_V2 = 'lords-ledger-v2-save';
export const LEGACY_SAVE_KEY = 'lords-ledger-save';
export const SAVE_VERSION = 2;

const resourceIds = ALL_RESOURCES;

const seasonalEventById = new Map<string, EventDefinition>(Object.values(seasonalEvents).flat().map(event => [event.id, event]));
const randomEventById = new Map<string, EventDefinition>(randomEvents.map(event => [event.id, event]));
const flipById = new Map<string, unknown>(Object.entries({ ...PERSPECTIVE_FLIPS, ...CYOA_FLIPS }));

export type ResourceId = AuthoredResourceId;
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GamePhase =
  | 'title' | 'management' | 'seasonal_action' | 'seasonal_resolve'
  | 'random_event' | 'random_resolve' | 'raid_warning' | 'raid_result'
  | 'flip_intro' | 'flip_decision' | 'flip_outcome' | 'flip_summary'
  | 'game_over' | 'victory';

export interface BuildingInstance {
  instanceId: string;
  type: BuildingId;
  condition: number;
  builtOnTurn: number;
  freeUpkeep?: boolean;
}

/** The first typed contract covers fields required for safe loading and core play. */
export interface GameSnapshot extends ViewMetadata {
  currentEvent: SavedEvent | null;
  currentRandomEvent: SavedEvent | null;
  raids: SavedRaidState;
  market: SavedMarketState;
  marketPrices: GeneratedMarketPrices;
  watchtower: SavedWatchtowerState;
  rngState: number;
  phase: GamePhase;
  difficulty: Difficulty;
  turn: number;
  season: Season;
  year: number;
  denarii: number;
  taxRate: keyof typeof TAX_RATES;
  food: number;
  population: number;
  inventory: Inventory;
  buildings: Array<BuildingInstance | BuildingId>;
  garrison: number;
  castleLevel: FortificationLevels['walls'];
  gameOverReason: GameOverReason | null;
  activeTab: string;
  chronicle: SavedChronicleEntry[];
  tavern: {
    gambitScribesNoteSeen?: boolean;
    ratsScribesNoteSeen?: boolean;
    ratsPlayedThisSeason?: boolean;
    ratsBestScore?: number;
    martaSpiceInvestment?: boolean;
    aldricDrillActive?: number;
    wallStashFound?: boolean;
    totalVisits?: TavernLedgerInteger;
    gambitTotalWins?: TavernLedgerInteger;
    gambitTotalLosses?: TavernLedgerInteger;
    gambitNetEarnings?: TavernLedgerInteger;
    gambitRoundsThisSeason?: number;
    gambitLastChoice?: GambitWeapon | null;
    martaStoragePurchased?: boolean;
    pendingStrangerEncounter?: StrangerEncounterType | null;
    strangerAppearedThisSeason?: boolean;
    bardCurrentContent?: BardContent | null;
    bardSolvedRiddleIds?: string[];
    bardTalesRemaining?: number[];
    bardTalesServed?: number;
    bardRiddlesSolved?: number;
    martaCurrentContent?: CompanionContent | null;
    martaScribesNoteSeen?: boolean;
    martaOffersUsed?: string[];
    martaAdviceRemaining?: number[];
    martaStoriesRemaining?: number[];
    aldricCurrentContent?: CompanionContent | null;
    aldricScribesNoteSeen?: boolean;
    aldricOffersUsed?: string[];
    aldricAdviceRemaining?: number[];
    aldricStoriesRemaining?: number[];
  };
  military: MilitaryDefenseState;
  chapel: ChapelSaveState;
  people: CompatiblePeopleState;
  greatHall: HallSaveState;
  blacksmith: ForgeSaveState;
  synergies: SavedSynergyState;
}

type CompatibleSnapshot = Omit<GameSnapshot, 'rngState'> & { rngState?: number };

export interface SaveEnvelope {
  format: 'lords-ledger';
  version: typeof SAVE_VERSION;
  state: GameSnapshot;
}

export type SaveReadResult =
  | { ok: true; state: GameSnapshot }
  | { ok: false; error: string; canRestartManuscript?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonnegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function validateTavernScalars(tavern: Record<string, unknown>): string | null {
  const prototype = Object.getPrototypeOf(tavern);
  const serializer = Object.getOwnPropertyDescriptor(tavern, 'toJSON');
  if ((prototype !== Object.prototype && prototype !== null) ||
      (serializer && (!Object.hasOwn(serializer, 'value') || typeof serializer.value === 'function'))) {
    return 'Save Tavern data container is invalid.';
  }
  for (const key of ['gambitScribesNoteSeen', 'ratsScribesNoteSeen', 'wallStashFound',
    'totalVisits', 'gambitTotalWins', 'gambitTotalLosses', 'gambitNetEarnings'] as const) {
    const field = Object.getOwnPropertyDescriptor(tavern, key);
    if (!field) {
      if (key in tavern) return `Save Tavern ${key} must be own data.`;
      continue;
    }
    if (!field.enumerable || !Object.hasOwn(field, 'value')) return `Save Tavern ${key} must be enumerable data.`;
    const scalar: unknown = field.value;
    if (scalar === undefined) continue;
    const isFlag = key === 'gambitScribesNoteSeen' || key === 'ratsScribesNoteSeen' || key === 'wallStashFound';
    if (isFlag ? typeof scalar !== 'boolean' : !isTavernLedgerInteger(scalar, key !== 'gambitNetEarnings')) {
      return `Save Tavern ${key} is invalid.`;
    }
  }
  return null;
}

function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === 'string' && Object.hasOwn(BUILDINGS, value);
}

function isSavedEffect(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000;
}

function isOptionalText(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

function validateSavedEvent(
  value: unknown,
  kind: 'seasonal' | 'random',
): string | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.id !== 'string') return `Save ${kind} event is invalid.`;
  const definition = kind === 'seasonal' ? seasonalEventById.get(value.id) : randomEventById.get(value.id);
  if (!definition) return `Save ${kind} event ID is not recognized.`;
  if (!Array.isArray(value.options) || value.options.length === 0 || value.options.length !== definition.options.length) {
    return `Save ${kind} event has missing choices.`;
  }
  if (typeof value.title !== 'string' || value.title.trim() === '' ||
      typeof value.description !== 'string' || value.description.trim() === '') {
    return `Save ${kind} event text is invalid.`;
  }
  if (!isOptionalText(value.scribesNote)) return `Save ${kind} event note must be text or null.`;
  const savedOptions: unknown[] = value.options;
  for (const [index, option] of savedOptions.entries()) {
    if (!isRecord(option) || typeof option.text !== 'string' || option.text.trim() === '') {
      return `Save ${kind} event has an invalid choice.`;
    }
    for (const [key, label] of [['scribesNote', 'choice note'], ['causeChainSummary', 'choice summary']] as const) {
      if (!isOptionalText(option[key])) return `Save ${kind} event ${label} must be text or null.`;
    }
    const authoredOption = definition.options[index];
    const savedEffects = option.effects;
    if (!authoredOption || !isRecord(savedEffects) ||
        Object.keys(savedEffects).length !== Object.keys(authoredOption.effects).length) {
      return `Save ${kind} event has invalid choice effects.`;
    }
    for (const [key, expectedEffect] of Object.entries(authoredOption.effects)) {
      const effect = savedEffects[key];
      if (!isSavedEffect(effect) || effect !== expectedEffect) {
        return `Save ${kind} event has invalid choice effects.`;
      }
    }
    if (typeof option.chronicle !== 'string' || !isRecord(option.indicators) ||
        Object.values(option.indicators).some(indicator => typeof indicator !== 'string')) {
      return `Save ${kind} event has an invalid choice description.`;
    }
    for (const key of ['treasury', 'people', 'military', 'faith', 'denarii', 'food', 'population', 'garrison']) {
      const direction = option.indicators[key];
      if (direction !== undefined && direction !== '' && direction !== 'up' && direction !== 'down') {
        return `Save ${kind} event choice indicator ${key} is invalid.`;
      }
    }
  }
  return null;
}

function validateRaidPhase(state: Record<string, unknown>): string | null {
  const raids = state.raids;
  if (!isRecord(raids)) return 'Save raid state is invalid.';
  const bookkeepingIssue = validateRaidBookkeeping(raids);
  if (bookkeepingIssue) return bookkeepingIssue;
  const active = raids.activeRaid;
  const isRaidPhase = state.phase === 'raid_warning' || state.phase === 'raid_result';
  if (!isRaidPhase) return active == null ? null : 'Save has a raid outside a raid phase.';
  if (!isRecord(active) || (active.type !== 'criminal' && active.type !== 'scottish')) {
    return 'Save is missing a valid pending raid.';
  }
  const expectedPhase = state.phase === 'raid_warning' ? 'warning' : 'result';
  if (active.phase !== expectedPhase) return 'Save pending raid phase does not match the game phase.';
  for (const key of ['defenseThreshold', 'watchtowerBonus']) {
    if (active[key] != null && !isFiniteNumber(active[key])) return `Save raid ${key} must be a finite number or null.`;
  }
  if (active.drillBonus !== undefined &&
      (!Number.isSafeInteger(active.drillBonus) || (active.drillBonus as number) < 0 ||
       (active.drillBonus as number) > (state.garrison as number))) return 'Save raid drill bonus is invalid.';
  if (active.defenseRating !== undefined &&
      (!Number.isSafeInteger(active.defenseRating) || (active.defenseRating as number) < 0 ||
       (active.defenseRating as number) > 1000)) return 'Save raid defense rating is invalid.';
  if (expectedPhase === 'warning') {
    return active.result == null ? null : 'Save raid warning already has a result.';
  }
  const result = active.result;
  if (!isRecord(result) || typeof result.victory !== 'boolean' || typeof result.partial !== 'boolean' ||
      typeof result.narrativeLine !== 'string' || typeof result.raidName !== 'string') {
    return 'Save raid result is invalid.';
  }
  if (!isFiniteNumber(result.defenseRatio) || result.defenseRatio < 0 || result.defenseRatio > 1) {
    return 'Save raid result defenseRatio is invalid.';
  }
  for (const key of ['denariiDelta', 'foodDelta', 'populationDelta', 'garrisonDelta'] as const) {
    if (!isSavedEffect(result[key])) return `Save raid result ${key} is invalid.`;
  }
  if (result.tradeGoodLost !== null) {
    const lost = result.tradeGoodLost;
    if (!isRecord(lost) || typeof lost.resource !== 'string' ||
        !resourceIds.some(resource => resource === lost.resource) ||
        !isNonnegativeNumber(lost.amount) || !Number.isSafeInteger(lost.amount)) {
      return 'Save raid trade-good loss is invalid.';
    }
  }
  return null;
}

function validateFlipPhase(state: Record<string, unknown>): string | null {
  if (!['flip_intro', 'flip_decision', 'flip_outcome', 'flip_summary'].includes(String(state.phase))) return null;
  if (typeof state.currentFlipId !== 'string') return 'Save is missing the pending perspective shift.';
  const flip = flipById.get(state.currentFlipId);
  if (!isRecord(flip)) return 'Save perspective shift ID is not recognized.';
  if (!isRecord(state.currentFlipStats)) return 'Save perspective shift stats are invalid.';
  const isCyoa = flip.type === 'cyoa';
  if (isCyoa) {
    if (state.phase === 'flip_outcome') return 'Save perspective shift phase is invalid.';
    if (state.phase === 'flip_intro') return null;
    if (typeof state.currentCyoaNodeId !== 'string' || !isRecord(flip.nodes)) {
      return 'Save is missing the perspective shift scene.';
    }
    const node = flip.nodes[state.currentCyoaNodeId];
    if (!isRecord(node)) return 'Save perspective shift scene is not recognized.';
    if (state.phase === 'flip_decision' && (node.isEnding === true || !Array.isArray(node.options) || node.options.length === 0)) {
      return 'Save perspective shift has no available choices.';
    }
    if (state.phase === 'flip_summary' && (node.isEnding !== true || state.cyoaEndingType !== node.endingType)) {
      return 'Save perspective shift ending is invalid.';
    }
    return null;
  }
  const decisionIndex = state.currentDecisionIndex;
  if (!Array.isArray(flip.decisions) || typeof decisionIndex !== 'number' || !Number.isInteger(decisionIndex) ||
      decisionIndex < 0 || decisionIndex >= flip.decisions.length) {
    return 'Save perspective shift decision is invalid.';
  }
  if (!isRecord(flip.characterStats)) return 'Save perspective shift definition is invalid.';
  for (const key of Object.keys(flip.characterStats)) {
    const stat = state.currentFlipStats[key];
    if (!isFiniteNumber(stat) || stat < 0 || stat > 100) return `Save perspective shift stat ${key} is invalid.`;
  }
  if (state.phase === 'flip_outcome' && (typeof state.currentFlipOutcome !== 'string' || state.currentFlipOutcome.trim() === '')) {
    return 'Save perspective shift outcome is missing.';
  }
  const decision = flip.decisions[decisionIndex];
  if (state.phase === 'flip_decision' && (!isRecord(decision) || !Array.isArray(decision.options) || decision.options.length === 0)) {
    return 'Save perspective shift has no available choices.';
  }
  return null;
}

const stringFields = ['phase', 'difficulty', 'season', 'taxRate', 'activeTab'] as const;
const numericFields = [
  'turn', 'year', 'denarii', 'food', 'population', 'inventoryCapacity',
  'totalPlots', 'garrison', 'castleLevel', 'castleUpgradeProgress',
  'churchDonation', 'bankruptcyTurns', 'starvationTurns', 'tradeCount',
  'lastFlipTurn', 'currentDecisionIndex',
] as const;
const booleanFields = ['castleUpgrading', 'militaryEventEverFired'] as const;
const arrayFields = [
  'buildings', 'economyHistory', 'defenseUpgrades', 'tutorialsSeen',
  'seasonReport', 'chronicle', 'usedSeasonalIds', 'usedRandomIds',
  'causeChain', 'flipConsequenceFlags', 'pendingSynergyNotifications',
] as const;
const recordFields = [
  'inventory', 'laborAllocation', 'marketPrices', 'resourceDeltas',
  'perspectiveFlips', 'synergies', 'raids', 'watchtower', 'tavern',
  'chapel', 'market', 'greatHall', 'military', 'people', 'blacksmith',
] as const;
const nullableFields = [
  'currentEvent', 'currentRandomEvent', 'scribesNote', 'gameOverReason',
  'currentFlipId', 'currentFlipStats', 'currentFlipOutcome',
  'currentCyoaNodeId', 'cyoaEndingType',
] as const;

function validateSnapshot(value: unknown): string | null {
  if (!isRecord(value)) return 'Save state must be an object.';
  if (value.rngState !== undefined && !isRandomState(value.rngState)) return 'Save random state is invalid.';
  for (const key of stringFields) {
    if (typeof value[key] !== 'string') return `Save field ${key} must be text.`;
  }
  if (typeof value.taxRate !== 'string' || !Object.hasOwn(TAX_RATES, value.taxRate)) {
    return 'Save tax rate is not recognized.';
  }
  for (const key of numericFields) {
    if (!isFiniteNumber(value[key])) return `Save field ${key} must be a finite number.`;
  }
  for (const key of booleanFields) {
    if (typeof value[key] !== 'boolean') return `Save field ${key} must be true or false.`;
  }
  for (const key of arrayFields) {
    if (!Array.isArray(value[key])) return `Save field ${key} must be a list.`;
  }
  if (!isSavedChronicle(value.chronicle)) return 'Save Chronicle entries are invalid.';
  for (const key of recordFields) {
    if (!isRecord(value[key])) return `Save section ${key} is missing or invalid.`;
  }
  for (const key of nullableFields) {
    if (!Object.hasOwn(value, key)) return `Save field ${key} is missing.`;
  }
  const metadataIssue = validateViewMetadata(value);
  if (metadataIssue) return metadataIssue;
  const watchtowerIssue = validateWatchtowerState(value.watchtower);
  if (watchtowerIssue) return watchtowerIssue;

  const synergies = value.synergies;
  if (!isRecord(synergies) || !isActivatedSynergies(synergies.activated)) {
    return 'Save activated synergy list is invalid.';
  }
  const synergyMetadataIssue = validateSynergyMetadata(synergies);
  if (synergyMetadataIssue) return synergyMetadataIssue;

  const chapelIssue = validateChapelState(value.chapel);
  if (chapelIssue) return chapelIssue;
  const peopleIssue = validatePeopleState(value.people);
  if (peopleIssue) return peopleIssue;
  const hallIssue = validateHallAudienceState(value.greatHall);
  if (hallIssue) return hallIssue;
  const disputeIssue = validateHallDisputeState(value.greatHall);
  if (disputeIssue) return disputeIssue;
  const civicIssue = validateHallCivicState(value.greatHall);
  if (civicIssue) return civicIssue;

  const feastIssue = validateHallFeastState(value.greatHall, value.season, value.year);
  if (feastIssue) return feastIssue;

  const consequenceIssue = validateHallConsequenceState(value.greatHall);
  if (consequenceIssue) return consequenceIssue;

  const phases: readonly string[] = [
    'title', 'management', 'seasonal_action', 'seasonal_resolve',
    'random_event', 'random_resolve', 'raid_warning', 'raid_result',
    'flip_intro', 'flip_decision', 'flip_outcome', 'flip_summary',
    'game_over', 'victory',
  ];
  if (!phases.includes(value.phase as string)) return 'Save phase is not supported.';
  if (!['easy', 'normal', 'hard'].includes(value.difficulty as string)) return 'Save difficulty is not supported.';
  const seasons: readonly string[] = ['spring', 'summer', 'autumn', 'winter'];
  if (!seasons.includes(value.season as string)) return 'Save season is not supported.';
  if (!Number.isInteger(value.turn) || (value.turn as number) < 1 || (value.turn as number) > 40) return 'Save turn must be between 1 and 40.';
  if (!Number.isInteger(value.year) || (value.year as number) < 1 || (value.year as number) > 10) return 'Save year is invalid.';
  const expectedYear = Math.ceil((value.turn as number) / 4);
  const expectedSeason = seasons[((value.turn as number) - 1) % 4];
  if (value.year !== expectedYear || value.season !== expectedSeason) return 'Save turn, year, and season disagree.';
  for (const key of ['denarii', 'food', 'population', 'garrison', 'inventoryCapacity', 'totalPlots'] as const) {
    if (!isNonnegativeNumber(value[key])) return `Save field ${key} cannot be negative.`;
  }
  if (!Number.isSafeInteger(value.garrison)) return 'Save garrison must be a whole number.';
  if (!isFortificationLevel('walls', value.castleLevel)) return 'Save castleLevel is not an authored level.';

  const forgeIssue = validateForgeState(value.blacksmith, value.turn);
  if (forgeIssue) return forgeIssue;

  const inventory = value.inventory;
  if (!isRecord(inventory)) return 'Save inventory is invalid.';
  for (const key of Object.keys(inventory)) {
    if (!Object.hasOwn(RESOURCE_CONFIG, key)) return `Save inventory.${key} is not recognized.`;
  }
  for (const key of resourceIds) {
    if (!isNonnegativeNumber(inventory[key])) return `Save inventory.${key} is missing or invalid.`;
  }
  for (const key of ['salt', 'tools', 'spices'] as const) {
    if (inventory[key] !== undefined && !isNonnegativeNumber(inventory[key])) {
      return `Save inventory.${key} is invalid.`;
    }
  }
  const buildings = value.buildings;
  if (!Array.isArray(buildings)) return 'Save buildings are invalid.';
  const seenInstances = new Set<string>();
  for (const [index, building] of buildings.entries()) {
    if (typeof building === 'string') {
      if (!isBuildingId(building)) return `Save building ${index} type is not recognized.`;
      continue; // Current legacy adapter supports authored string entries.
    }
    if (!isRecord(building)) return `Save building ${index} is invalid.`;
    const prototype = Object.getPrototypeOf(building);
    const serializer = Object.getOwnPropertyDescriptor(building, 'toJSON');
    if ((prototype !== Object.prototype && prototype !== null) ||
        (serializer && (!('value' in serializer) || typeof serializer.value === 'function'))) {
      return `Save building ${index} must be a plain data record.`;
    }
    // Consumed fields must survive JSON without running getters or losing waivers.
    for (const key of ['instanceId', 'type', 'condition', 'builtOnTurn', 'freeUpkeep']) {
      const field = Object.getOwnPropertyDescriptor(building, key);
      if ((!field && key !== 'freeUpkeep') || (field && (!field.enumerable || !('value' in field)))) {
        return `Save building ${index}.${key} must be an enumerable data field.`;
      }
    }
    if (building.freeUpkeep !== undefined && typeof building.freeUpkeep !== 'boolean') {
      return `Save building ${index}.freeUpkeep must be a boolean.`;
    }
    if (typeof building.instanceId !== 'string' ||
        typeof building.type !== 'string' || !isNonnegativeNumber(building.condition) ||
        building.condition > 100 || !isNonnegativeNumber(building.builtOnTurn)) {
      return `Save building ${index} is invalid.`;
    }
    if (!isBuildingId(building.type)) return `Save building ${index} type is not recognized.`;
    if (seenInstances.has(building.instanceId)) return `Save building ${index} has a duplicate ID.`;
    seenInstances.add(building.instanceId);
  }

  const military = value.military;
  if (!isRecord(military) || !isRecord(military.garrison)) return 'Save military roster is invalid.';
  for (const key of ['levy', 'menAtArms', 'knights'] as const) {
    if (!isNonnegativeNumber(military.garrison[key]) || !Number.isSafeInteger(military.garrison[key])) {
      return `Save military.garrison.${key} must be a nonnegative whole number.`;
    }
  }
  for (const track of ['walls', 'gate', 'moat'] as const) {
    if (!isFortificationLevel(track, military[track])) return `Save military.${track} is not an authored level.`;
  }
  if (!isFiniteNumber(military.morale) || military.morale < 0 || military.morale > 100) return 'Save military morale is invalid.';
  const marketPrices = value.marketPrices;
  if (!isGeneratedMarketPrices(marketPrices)) return 'Save market prices are invalid.';
  const market = value.market;
  if (!isRecord(market)) return 'Save market state is invalid.';
  if (!isMarketReputation(market.reputation)) return 'Save market reputation is invalid.';
  const marketMetadataIssue = validateMarketMetadata(market);
  if (marketMetadataIssue) return marketMetadataIssue;
  if(Object.hasOwn(market,'supply')&&(!Object.prototype.propertyIsEnumerable.call(market,'supply')||!isMarketSupply(market.supply,value.turn as number)))return 'Save market supply is invalid.';
  if (market.activeHaggle !== undefined && market.activeHaggle !== null &&
      !isActiveHaggle(market.activeHaggle, value.season, marketPrices, market.reputation)) {
    return 'Save pending market haggle is invalid.';
  }
  const tavern = value.tavern;
  if (!isRecord(tavern)) return 'Save tavern state is invalid.';
  const tavernScalarIssue = validateTavernScalars(tavern);
  if (tavernScalarIssue) return tavernScalarIssue;
  if (tavern.gambitRoundsThisSeason !== undefined &&
      (!Number.isSafeInteger(tavern.gambitRoundsThisSeason) ||
       (tavern.gambitRoundsThisSeason as number) < 0 ||
       (tavern.gambitRoundsThisSeason as number) > GAMBIT_MAX_ROUNDS)) {
    return 'Save Gambit round count is invalid.';
  }
  if (tavern.gambitLastChoice !== undefined && tavern.gambitLastChoice !== null &&
      !isGambitWeapon(tavern.gambitLastChoice)) return 'Save Gambit last choice is invalid.';
  if (tavern.ratsPlayedThisSeason !== undefined && typeof tavern.ratsPlayedThisSeason !== 'boolean') {
    return 'Save cellar play flag is invalid.';
  }
  if (tavern.ratsBestScore !== undefined &&
      (!Number.isSafeInteger(tavern.ratsBestScore) ||
       (tavern.ratsBestScore as number) < 0 ||
       (tavern.ratsBestScore as number) > MAX_RAT_SPAWNS)) {
    return 'Save cellar best score is invalid.';
  }
  if (tavern.strangerAppearedThisSeason !== undefined && typeof tavern.strangerAppearedThisSeason !== 'boolean') {
    return 'Save stranger encounter flag is invalid.';
  }
  if (tavern.pendingStrangerEncounter !== undefined && tavern.pendingStrangerEncounter !== null &&
      !isStrangerEncounterType(tavern.pendingStrangerEncounter)) {
    return 'Save pending stranger encounter is invalid.';
  }
  if (tavern.strangerAppearedThisSeason === true && tavern.pendingStrangerEncounter != null) {
    return 'Save stranger encounter cannot be both pending and completed.';
  }
  const bardContent = tavern.bardCurrentContent;
  if (bardContent !== undefined && !isBardContent(bardContent)) return 'Save Bard content is invalid.';
  if (tavern.bardSolvedRiddleIds !== undefined && !isBardSolvedIds(tavern.bardSolvedRiddleIds)) {
    return 'Save solved Bard riddles are invalid.';
  }
  if (tavern.bardTalesRemaining !== undefined && !isBardTaleQueue(tavern.bardTalesRemaining)) {
    return 'Save Bard tale queue is invalid.';
  }
  if (tavern.bardTalesServed !== undefined &&
      (!Number.isSafeInteger(tavern.bardTalesServed) || (tavern.bardTalesServed as number) < 0)) {
    return 'Save Bard tale count is invalid.';
  }
  if (tavern.bardRiddlesSolved !== undefined &&
      (!Number.isSafeInteger(tavern.bardRiddlesSolved) || (tavern.bardRiddlesSolved as number) < 0)) {
    return 'Save Bard solved count is invalid.';
  }
  if (bardContent?.type === 'riddle' && bardContent.awarded &&
      (!isBardSolvedIds(tavern.bardSolvedRiddleIds) ||
       !tavern.bardSolvedRiddleIds.includes(bardContent.id))) {
    return 'Save rewarded Bard riddle is missing from solved history.';
  }
  for (const kind of ['marta', 'aldric'] as const) {
    const label = kind === 'marta' ? 'Marta' : 'Aldric';
    const content = tavern[`${kind}CurrentContent`];
    const used = tavern[`${kind}OffersUsed`];
    const advice = tavern[`${kind}AdviceRemaining`];
    const stories = tavern[`${kind}StoriesRemaining`];
    if (content !== undefined && !isCompanionContent(kind, content)) return `Save ${label} content is invalid.`;
    if (used !== undefined && !isCompanionOfferIds(kind, used)) return `Save ${label} offer history is invalid.`;
    if (advice !== undefined && !isCompanionQueue(kind, 'advice', advice)) return `Save ${label} advice queue is invalid.`;
    if (stories !== undefined && !isCompanionQueue(kind, 'stories', stories)) return `Save ${label} story queue is invalid.`;
    if (content && isCompanionContent(kind, content) && content.type === 'offer' &&
        (!isCompanionOfferIds(kind, used) ||
         used.includes(content.offerId) !== (content.resolution !== null))) {
      return `Save ${label} offer and history disagree.`;
    }
  }
  if (tavern.martaSpiceInvestment !== undefined && typeof tavern.martaSpiceInvestment !== 'boolean') {
    return 'Save Marta investment is invalid.';
  }
  if (tavern.martaStoragePurchased !== undefined && typeof tavern.martaStoragePurchased !== 'boolean') {
    return 'Save Marta storage purchase is invalid.';
  }
  for (const key of ['martaScribesNoteSeen', 'aldricScribesNoteSeen'] as const) {
    if (tavern[key] !== undefined && typeof tavern[key] !== 'boolean') {
      return `Save ${key} is invalid.`;
    }
  }
  if (tavern.aldricDrillActive !== undefined &&
      (!Number.isSafeInteger(tavern.aldricDrillActive) ||
       (tavern.aldricDrillActive as number) < 0 || (tavern.aldricDrillActive as number) > 3)) {
    return 'Save Aldric drill duration is invalid.';
  }
  const seasonalIssue = validateSavedEvent(value.currentEvent, 'seasonal');
  if (seasonalIssue) return seasonalIssue;
  const randomIssue = validateSavedEvent(value.currentRandomEvent, 'random');
  if (randomIssue) return randomIssue;
  if (value.phase === 'seasonal_action' && value.currentEvent === null) return 'Save is missing the pending event and choices.';
  if (value.phase === 'random_event' && value.currentRandomEvent === null) return 'Save is missing the pending event and choices.';
  const raidIssue = validateRaidPhase(value);
  if (raidIssue) return raidIssue;
  const flipIssue = validateFlipPhase(value);
  if (flipIssue) return flipIssue;
  if (value.phase === 'game_over') {
    const loss = value.gameOverReason;
    if (!isRecord(loss) || !['depopulation', 'bankruptcy', 'famine'].includes(String(loss.type)) ||
        typeof loss.reason !== 'string' || loss.reason.trim() === '') {
      return 'Save game-over reason is missing or invalid.';
    }
  }
  return null;
}

function assertSnapshot(value: unknown): asserts value is CompatibleSnapshot {
  const issue = validateSnapshot(value);
  if (issue) throw new Error(issue);
}

/** In-memory simulation output must already carry its random cursor; no migration or copying. */
export function assertGameSnapshot(value: unknown): asserts value is GameSnapshot {
  assertSnapshot(value);
  if (!isRandomState(value.rngState)) throw new Error('Game state random cursor is missing or invalid.');
}

function withRandomState(state: CompatibleSnapshot): GameSnapshot {
  return { ...state, rngState: state.rngState === undefined ? seedLegacySnapshot(state) : state.rngState };
}

function decodeJson(raw: string): unknown {
  try { return JSON.parse(raw) as unknown; }
  catch { throw new Error('Save data is not valid JSON. The stored save was left untouched.'); }
}

function readResult(fn: () => SaveReadResult): SaveReadResult {
  try { return fn(); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Save could not be read.' }; }
}

function readSnapshot(value: unknown, restartManuscript: boolean): SaveReadResult {
  const issue = validateSnapshot(value);
  if (!issue) {
    assertSnapshot(value);
    return { ok: true, state: withRandomState(value) };
  }
  const repaired = issue.startsWith('Save manuscript') ? restartSavedManuscript(value) : null;
  if (repaired && validateSnapshot(repaired) === null) {
    if (restartManuscript) {
      // Older snapshots gain the same seed they would have gained before this recovery.
      if (repaired.rngState === undefined) repaired.rngState = seedLegacySnapshot(value);
      assertSnapshot(repaired);
      return { ok: true, state: withRandomState(repaired) };
    }
    return { ok: false, error: issue, canRestartManuscript: true };
  }
  return { ok: false, error: issue };
}

export function readV2Save(raw: string, options?: { restartManuscript: true }): SaveReadResult {
  return readResult(() => {
    const envelope = decodeJson(raw);
    if (!isRecord(envelope) || envelope.format !== 'lords-ledger') throw new Error('This is not a Lord’s Ledger 2.0 save.');
    if (envelope.version !== SAVE_VERSION) throw new Error(`Save version ${String(envelope.version)} is not supported.`);
    return readSnapshot(envelope.state, options?.restartManuscript === true);
  });
}

export function readLegacySave(raw: string, options?: { restartManuscript: true }): SaveReadResult {
  return readResult(() => {
    const state = decodeJson(raw);
    return readSnapshot(state, options?.restartManuscript === true);
  });
}

export function writeV2Save(state: unknown): string {
  assertSnapshot(state);
  const envelope: SaveEnvelope = { format: 'lords-ledger', version: SAVE_VERSION, state: withRandomState(state) };
  const raw = JSON.stringify(envelope);
  // JSON may drop inherited fields or invoke toJSON. Check the bytes the reader will receive.
  const serialized = readV2Save(raw);
  if (!serialized.ok) throw new Error(serialized.error);
  return raw;
}
