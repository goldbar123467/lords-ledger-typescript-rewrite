import {createInitialState,gameReducer} from '../../src/engine/gameReducer.js';
export function chronicleFixture(historical=false){
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'chronicle'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'chronicle'}});
 state=gameReducer(state,{type:'SELL_RESOURCE',payload:{resource:'grain',quantity:10}});
 if(historical)state={...state,chronicle:[...state.chronicle,
  {text:'An older entry without date metadata.'},
  {text:'Older constructor-kind wording.',type:'constructor',season:'flood season',year:2.5,turn:null,annotation:{scribe:'Older hand'}},
  {text:'Older prototype-kind wording.',type:'__proto__',season:null,year:null},
 ]};
 return state;
}
