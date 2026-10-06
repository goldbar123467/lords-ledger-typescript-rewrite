import BUILDINGS,{type BuildingDefinition} from '../data/buildings.ts';
import {FOOD_RESOURCES,SEASON_FARM_MULTIPLIERS,SEASON_DEGRADE_MULTIPLIERS} from '../data/economy.ts';
import {getBuildingOutput} from './economyEngine.ts';
import {getBuildingType,type BuildingEntry} from './buildingActions.ts';
import {getAgricultureBonuses} from './forgeAgriculture.ts';
import {getDeployedToolIds} from './forgeTools.ts';
import {getSeasonFoodRequirement,type EconomySeason,type EconomyDifficulty} from './foodRequirement.ts';
export interface WeatherVaneState {
 readonly blacksmith?:unknown;readonly turn:number;readonly season:EconomySeason;
 readonly population:number;readonly garrison:number;readonly difficulty?:EconomyDifficulty;
 readonly buildings:readonly BuildingEntry[];
}
const seasons=['spring','summer','autumn','winter'] as const;
const buildings:Readonly<Record<string,BuildingDefinition>>=BUILDINGS;
/** Conditional planning information; reading it never spends the saved random cursor. */
export function getWeatherVaneOutlook(state:WeatherVaneState) {
 if(!getDeployedToolIds(state.blacksmith).has('weather_vane')||!Number.isSafeInteger(state.turn)||state.turn<1||state.turn>40||
  seasons[(state.turn-1)%4]!==state.season||!Number.isFinite(state.population)||state.population<0||!Number.isFinite(state.garrison)||state.garrison<0)return null;
 if(state.turn===40)return {kind:'final'} as const;
 const season=seasons[state.turn%4];if(!season)return null;
 const currentBuildings=[...state.buildings],bonuses=getAgricultureBonuses(state.blacksmith);
 let farmFood=0;
 for(const building of currentBuildings){if(!buildings[getBuildingType(building)]?.isFarm)continue;
  const output=getBuildingOutput(building,currentBuildings,season,bonuses);
  for(const resource of FOOD_RESOURCES)farmFood+=output[resource]??0;
 }
 const foodNeed=getSeasonFoodRequirement(state.population,state.garrison,season,state.difficulty??'normal').totalNeed;
 if(!Number.isFinite(farmFood)||!Number.isFinite(foodNeed))return null;
 return {kind:'next',season,turn:state.turn+1,farmMultiplier:SEASON_FARM_MULTIPLIERS[season],
  wearMultiplier:SEASON_DEGRADE_MULTIPLIERS[season],farmFood,
  foodNeed} as const;
}
