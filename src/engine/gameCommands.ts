import type { Difficulty, GameSnapshot } from '../save/saveGame.ts';
import type { TabId } from '../data/tabs.ts';
import type { BuildingId } from '../data/buildings.ts';
import type { ResourceId } from '../data/economy.ts';
import type { EventDefinition, SeasonalEvent } from '../data/eventTypes.ts';
import type { MarketMerchantId } from '../data/market.ts';
import type { MartaOfferId, AldricOfferId } from '../data/tavern.ts';
import type { GambitWeapon } from './tavernGambit.ts';
import type { RatRunResult } from './ratsInCellar.ts';
import type { HaggleMode } from './marketHaggle.ts';
import type { PeopleAction } from './peopleActions.ts';
import type { MilitaryAction } from './militaryActions.ts';
import type { ChapelAction } from './chapelState.ts';
import type { DisputeAction } from './disputeActions.ts';
import type { AudienceAction } from './audienceActions.ts';
import type { HallCivicAction } from './hallCivic.ts';
import type { FeastSelection } from './feast.ts';
import type { ForgeAncillaryCommand } from './forgeAncillaryActions.ts';
import type { ForgeItemCommand } from './forgeItemActions.ts';
import type { ForgeCompletionCommand } from './forgeCompletion.ts';

export interface EventPools {
  seasonalEvents?: readonly SeasonalEvent[];
  randomEvents?: readonly EventDefinition[];
}
export type TavernAction =
  | Readonly<{ type: 'TAVERN_VISIT' | 'TAVERN_GAMBIT_SCRIBES_NOTE_SEEN' | 'TAVERN_RATS_SCRIBES_NOTE_SEEN' | 'TAVERN_BARD_NEXT' | 'TAVERN_MARTA_NEXT' | 'TAVERN_MARTA_SCRIBES_NOTE_SEEN' | 'TAVERN_ALDRIC_NEXT' | 'TAVERN_ALDRIC_SCRIBES_NOTE_SEEN' | 'TAVERN_WALL_STASH' | 'TAVERN_STRANGER_TRADE' | 'TAVERN_STRANGER_DISMISS' }>
  | Readonly<{ type: 'TAVERN_GAMBIT_PLAY'; payload: Readonly<{ choice: GambitWeapon; wager: number; seed: number }> }>
  | Readonly<{ type: 'TAVERN_RATS_FINISH'; payload: Readonly<RatRunResult> }>
  | Readonly<{ type: 'TAVERN_BARD_ANSWER'; payload: Readonly<{ option: string }> }>
  | Readonly<{ type: 'TAVERN_MARTA_ACCEPT_OFFER' | 'TAVERN_MARTA_DECLINE_OFFER'; payload: Readonly<{ offerId: MartaOfferId }> }>
  | Readonly<{ type: 'TAVERN_ALDRIC_ACCEPT_OFFER' | 'TAVERN_ALDRIC_DECLINE_OFFER'; payload: Readonly<{ offerId: AldricOfferId }> }>;

/** Typed commands from trusted UI/domain callers; external command validation remains separate. */
export type GameCommand = PeopleAction | MilitaryAction | ChapelAction | TavernAction |
  DisputeAction | AudienceAction | HallCivicAction | ForgeAncillaryCommand | ForgeItemCommand |
  { type: 'START_GAME' | 'PLAY_AGAIN'; payload?: EventPools & { difficulty?: Difficulty; seed?: number } } |
  { type: 'SET_TAB' | 'DISMISS_TUTORIAL'; payload: { tab: TabId } } |
  { type: 'BUILD_BUILDING'; payload: { buildingId: BuildingId } } |
  { type: 'DEMOLISH_BUILDING' | 'REPAIR_BUILDING' | 'UPGRADE_BUILDING'; payload: { buildingIndex: number } } |
  { type: 'SELL_RESOURCE' | 'BUY_RESOURCE'; payload: { resource: ResourceId; quantity: number; merchantId?: MarketMerchantId } } |
  { type: 'HAGGLE_START'; payload: { merchantId: MarketMerchantId; resource: ResourceId; quantity: number; mode: HaggleMode } } |
  { type: 'HAGGLE_COUNTER'; payload: { counterPrice: number } } |
  { type: 'HAGGLE_ACCEPT' | 'HAGGLE_WALK_AWAY' | 'RAID_DEFEND' | 'RAID_CONTINUE' | 'DISMISS_SCRIBES_NOTE' |
    'DISMISS_FLIP_INTRO' | 'CONTINUE_FLIP' | 'DISMISS_FLIP_SUMMARY' | 'DISMISS_SYNERGY_NOTIFICATION' |
    'HALL_DISMISS_EVENT' | 'WATCHTOWER_RODERIC_SCRIBES_NOTE_SEEN' | 'WATCHTOWER_SCAN_SCRIBES_NOTE_SEEN' |
    'BLACKSMITH_TALK' | 'BLACKSMITH_VISIT' } |
  /** These retained legacy commands ignore their payload and deliberately do nothing. */
  { type: 'UPGRADE_CASTLE' | 'INSTALL_DEFENSE'; payload?: unknown } |
  { type: 'DONATE_TO_CHURCH'; payload: { amount: number } } |
  { type: 'SIMULATE_SEASON' | 'CONTINUE_TO_RANDOM' | 'ADVANCE_TURN'; payload?: EventPools } |
  { type: 'SELECT_SEASONAL_ACTION' | 'SELECT_RANDOM_RESPONSE' | 'SELECT_FLIP_OPTION'; payload: { optionIndex: number } } |
  { type: 'SET_SCRIBES_NOTE'; payload: { text: string } } |
  { type: 'HALL_FEAST_COMPLETE'; payload: FeastSelection } |
  { type: 'WATCHTOWER_SCAN_COMPLETE'; payload: { scanSeed: number; foundKeys: string[] } } |
  { type: 'BLACKSMITH_FORGE_COMPLETE'; payload: ForgeCompletionCommand } |
  { type: 'LOAD_SAVE'; payload: { savedState: GameSnapshot } };
