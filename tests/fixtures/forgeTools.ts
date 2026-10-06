/** Legal domain commands with prescribed completion results, not played minigames. */
import assert from 'node:assert/strict';
import {createInitialState,gameReducer} from '../../src/engine/gameReducer.js';
import {FORGEABLE_ITEMS,FORGE_RESOURCES,type ForgeResourceId} from '../../src/data/blacksmith.ts';
import type {DeployableToolId} from '../../src/engine/forgeTools.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../src/save/saveGame.ts';
export const TOOL_IDS=['plowshare','scythe','nails','hinges_fittings','church_bell','lock_key','cauldron','horseshoes','weather_vane','chandelier'] as const satisfies readonly DeployableToolId[];
export type ToolSetupAction=
 | {type:'START_GAME';payload:{seed:number;difficulty:'normal'}}
 | {type:'SET_TAB';payload:{tab:'estate'|'hall'|'forge'}}
 | {type:'DISMISS_TUTORIAL';payload:{tab:'estate'|'hall'|'forge'}}
 | {type:'SELL_RESOURCE';payload:{resource:'grain';quantity:number}}
 | {type:'HALL_RULE_DISPUTE';payload:{disputeId:'dispute_001';rulingId:'a'}}
 | {type:'BLACKSMITH_VISIT'}
 | {type:'BLACKSMITH_BUY_RESOURCE';payload:{resource:ForgeResourceId;quantity:number}}
 | {type:'BLACKSMITH_FORGE_COMPLETE';payload:{itemId:DeployableToolId;qualityScore:50;completionUid:number}}
 | {type:'BLACKSMITH_EQUIP_ITEM';payload:{itemUid:number}}
 | {type:'BUILD_BUILDING';payload:{buildingId:'demesne_field'}};
export function checkedSnapshot(value:unknown):GameSnapshot {const r=readV2Save(writeV2Save(value));if(!r.ok)throw Error(r.error);return r.state;}
export function buildToolEstate(seed=104){
 let state=checkedSnapshot(createInitialState(seed));const actions:ToolSetupAction[]=[];
 function act(action:ToolSetupAction){const next=gameReducer(state,action);assert.notEqual(next,state,action.type+' must execute');state=checkedSnapshot(next);actions.push(action);}
 act({type:'START_GAME',payload:{seed,difficulty:'normal'}});
 act({type:'DISMISS_TUTORIAL',payload:{tab:'estate'}});
 // Sell genuine starter grain to fund construction and make room for production.
 act({type:'SELL_RESOURCE',payload:{resource:'grain',quantity:200}});
 act({type:'SET_TAB',payload:{tab:'hall'}});act({type:'DISMISS_TUTORIAL',payload:{tab:'hall'}});
 act({type:'HALL_RULE_DISPUTE',payload:{disputeId:'dispute_001',rulingId:'a'}});
 act({type:'SET_TAB',payload:{tab:'forge'}});act({type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});act({type:'BLACKSMITH_VISIT'});
 for(const itemId of TOOL_IDS){const recipe=FORGEABLE_ITEMS[itemId];
  for(const resource of FORGE_RESOURCES){const needed=Math.ceil(recipe.cost[resource.key]-state.inventory[resource.key]);if(needed>0)act({type:'BLACKSMITH_BUY_RESOURCE',payload:{resource:resource.key,quantity:needed}});}
  const uid=state.blacksmith.nextItemUid??1;
  act({type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId,qualityScore:50,completionUid:uid}});
  act({type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:uid}});
 }
 act({type:'SET_TAB',payload:{tab:'estate'}});const cash=state.denarii;
 act({type:'BUILD_BUILDING',payload:{buildingId:'demesne_field'}});
 assert.equal(cash-state.denarii,190);
 return {state,actions};
}
export function replayToolEstate(seed:number,actions:readonly ToolSetupAction[]){let state=checkedSnapshot(createInitialState(seed));for(const action of actions)state=checkedSnapshot(gameReducer(state,action));return state;}
