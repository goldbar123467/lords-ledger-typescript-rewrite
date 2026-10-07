import {createInitialState,gameReducer} from '../../src/engine/gameReducer.ts';
/** Paid normal-startup items with prescribed quality, for UI coverage rather than acquisition evidence. */
export function forgePanelFixture() {
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 for(let uid=1;uid<=5;uid++){
  const next=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:70,completionUid:uid}});
  if(next===state)throw Error('Paid Forge UI fixture was rejected');state=next;
 }
 return state;
}
