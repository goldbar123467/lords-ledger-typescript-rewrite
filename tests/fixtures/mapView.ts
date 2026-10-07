import {createInitialState,gameReducer} from '../../src/engine/gameReducer.ts';
import BUILDINGS from '../../src/data/buildings.ts';
import type {BuildingInstance,Season} from '../../src/save/saveGame.ts';
/** Seasonal/dense/empty/legacy variants are managed display fixtures, not acquired estates or campaigns. */
export function mapViewFixture(kind:'normal'|'dense'|'legacy'|'empty'='normal',season:Season='spring'){
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'map'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'market'}});
 if(kind!=='normal'){
  const buildings:BuildingInstance[]=Object.values(BUILDINGS).map(def=>({instanceId:'map-'+def.id,type:def.id,condition:100,builtOnTurn:0}));
  const military={...state.military,fortifications:{walls:kind==='empty'?0:3}};
  state={...state,buildings:kind==='empty'?[]:kind==='legacy'?buildings.map(building=>building.type):buildings,
   population:kind==='empty'?0:state.population,castleLevel:kind==='empty'?0:3,
   military,
   season,turn:['spring','summer','autumn','winter'].indexOf(season)+1};
 }
 return state;
}
