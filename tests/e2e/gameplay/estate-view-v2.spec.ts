import {test,expect,type Page} from '@playwright/test';
import BUILDINGS from '../../../src/data/buildings.ts';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

function snapshot(value:unknown):GameSnapshot{const result=readV2Save(writeV2Save(value));if(!result.ok)throw new Error(result.error);return result.state;}
async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}
async function center(element:ReturnType<Page['getByTestId']>){await element.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));}
for(const width of [390,1366]){
 for(const legacy of [false,true])test(`Estate preserves all building history and compatible entries ${legacy?'legacy':'modern'} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let state=snapshot(gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}}));
  state=snapshot(gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'estate'}}));
  // Managed display/repair fixture, not an acquired estate or a played campaign.
  state=snapshot({...state,buildings:Object.values(BUILDINGS).map(def=>legacy?def.id:{instanceId:'estate-'+def.id,type:def.id,condition:50,builtOnTurn:0})});
  await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Economy Overview',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('overview.png'),animations:'disabled'});
  for(const [index,def] of Object.values(BUILDINGS).entries()){
   const card=page.getByTestId(legacy?`built-building-${def.id}-${index}`:'built-building-estate-'+def.id);
   await expect(card.getByRole('heading',{name:def.name,exact:true})).toHaveCount(1);
   await center(card.getByRole('button',{name:'Info',exact:true}));await card.getByRole('button',{name:'Info',exact:true}).click();
   await expect(card.getByText(def.historicalNote,{exact:true})).toHaveCount(1);await card.getByRole('button',{name:'Hide',exact:true}).click();
  }
  await save(page,state);
  const farm=page.getByTestId(legacy?'built-building-strip_farm-0':'built-building-estate-strip_farm');await center(farm);await page.screenshot({path:info.outputPath('farm.png'),animations:'disabled'});
  if(!legacy){const repair=farm.getByRole('button',{name:/^Repair /});await center(repair);await repair.click();state=snapshot(gameReducer(state,{type:'REPAIR_BUILDING',payload:{buildingIndex:0}}));await save(page,state);}
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(farm).toHaveCount(1);await save(page,state);expect(errors).toEqual([]);
 });
 test(`Estate native construction upgrade and demolition preserve exact saves ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/Normal.*standard experience/i}).click();await page.getByRole('button',{name:'I Understand',exact:true}).click();
  await page.getByRole('button',{name:'Save game',exact:true}).click();const raw=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save')??'');const result=readV2Save(raw);if(!result.ok)throw new Error(result.error);let state=result.state;
  await page.screenshot({path:info.outputPath('ordinary.png'),animations:'disabled'});
  const buy=page.getByTestId('build-card-strip_farm').getByRole('button',{name:'Build (80d)',exact:true});await center(buy);await buy.click();state=snapshot(gameReducer(state,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}}));await save(page,state);expect(state.denarii).toBe(420);
  const index=state.buildings.length-1;const built=state.buildings[index];if(!built||typeof built==='string')throw new Error('Expected constructed instance');
  const farm=page.getByTestId('built-building-'+built.instanceId);const upgrade=farm.getByRole('button',{name:/Demesne Field \(120d\)/});await center(upgrade);await upgrade.click();state=snapshot(gameReducer(state,{type:'UPGRADE_BUILDING',payload:{buildingIndex:index}}));await save(page,state);expect(state.denarii).toBe(300);
  const upgraded=state.buildings[index];if(!upgraded||typeof upgraded==='string')throw new Error('Expected upgraded instance');const field=page.getByTestId('built-building-'+upgraded.instanceId);await center(field);await page.screenshot({path:info.outputPath('upgraded.png'),animations:'disabled'});
  await field.getByRole('button',{name:'Demolish',exact:true}).click();state=snapshot(gameReducer(state,{type:'DEMOLISH_BUILDING',payload:{buildingIndex:index}}));await expect(field).toHaveCount(0);await save(page,state);
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await save(page,state);expect(errors).toEqual([]);
 });
}
