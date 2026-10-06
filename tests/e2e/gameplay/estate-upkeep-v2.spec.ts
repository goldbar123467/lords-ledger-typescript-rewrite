import {test,expect,type Page} from '@playwright/test';
import {gameReducer} from '../../../src/engine/gameReducer.js';
import BUILDINGS from '../../../src/data/buildings.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

async function start(page:Page){
 await page.goto('/');await page.getByRole('button',{name:/Normal.*standard experience/i}).click();await page.getByRole('button',{name:'I Understand',exact:true}).click();
 await page.getByRole('button',{name:'Save game',exact:true}).click();const loaded=readV2Save(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save')??''));if(!loaded.ok)throw new Error(loaded.error);return loaded.state;
}
async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}
async function overview(page:Page,upkeep:number,net:number){
 const panel=page.getByRole('heading',{name:'Economy Overview',exact:true}).locator('..');
 for(const [label,value] of [['Upkeep',upkeep+'d'],['Net',(net>=0?'+':'')+net+'d']] as const){
  const card=panel.getByText(label,{exact:true}).locator('..');await card.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await expect(card.getByText(value,{exact:true})).toHaveCount(1);
 }
}
for(const width of [390,1366]){
 test(`Estate starting building cards disclose waived upkeep ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const state=await start(page);
  for(const id of ['coal_pit','tannery','sawmill','smelter'] as const){
   const card=page.getByTestId('built-building-'+id+'-0-pre');await card.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:info.outputPath(id+'.png'),animations:'disabled'});
   await expect(card.getByText('0d/season',{exact:true})).toHaveCount(1);await expect(card).toContainText('(waived; base '+BUILDINGS[id].upkeep+'d/season)');
  }
  await save(page,state);expect(errors).toEqual([]);
 });
 test(`Estate starting levy upkeep matches authored cost ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const state=await start(page);
  expect(state.military.garrison).toEqual({levy:5,menAtArms:0,knights:0});expect(state.garrison).toBe(5);
  await page.screenshot({path:info.outputPath('starting.png'),animations:'disabled'});
  // Five levy cost 1d each; initial buildings have free upkeep and castle tolls earn 5d.
  await overview(page,5,0);await page.screenshot({path:info.outputPath('starting-values.png'),animations:'disabled'});await save(page,state);expect(errors).toEqual([]);
 });
 test(`Estate mixed roster and paid building update upkeep through dismissal and reload ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let state=await start(page);
  await page.getByRole('button',{name:'Military tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'military'}});
  await page.getByRole('button',{name:'I Understand',exact:true}).click();state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'military'}});
  for(const [soldierType,name,cost] of [['menAtArms','Men-at-Arms',15],['knights','Knights',50]] as const){
   const recruit=page.getByRole('heading',{name,exact:true}).locator('../../..').getByRole('button',{name:'Recruit +1',exact:true});await recruit.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));const before=state.denarii;await recruit.click();state=gameReducer(state,{type:'RECRUIT_SOLDIERS',payload:{soldierType,count:1}});expect(state.denarii).toBe(before-cost);await save(page,state);
  }
  expect(state.military.garrison).toEqual({levy:5,menAtArms:1,knights:1});expect(state.denarii).toBe(435);
  await page.getByRole('button',{name:'Estate tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'estate'}});await page.screenshot({path:info.outputPath('mixed.png'),animations:'disabled'});
  // 5×1 + 1×4 + 1×8 = 17d; toll income remains 5d.
  await overview(page,17,-12);await save(page,state);
  const build=page.getByTestId('build-card-strip_farm').getByRole('button',{name:'Build (80d)',exact:true});await build.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await build.click();state=gameReducer(state,{type:'BUILD_BUILDING',payload:{buildingId:'strip_farm'}});expect(state.denarii).toBe(355);await overview(page,20,-15);await save(page,state);
  await page.getByRole('button',{name:'Military tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'military'}});const dismiss=page.getByRole('heading',{name:'Knights',exact:true}).locator('../../..').getByRole('button',{name:'Dismiss -1',exact:true});await dismiss.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await dismiss.click();state=gameReducer(state,{type:'DISMISS_SOLDIERS',payload:{soldierType:'knights',count:1}});expect(state.denarii).toBe(355);
  await page.getByRole('button',{name:'Estate tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'estate'}});await overview(page,12,-7);await page.screenshot({path:info.outputPath('dismissed-values.png'),animations:'disabled'});await save(page,state);
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await overview(page,12,-7);await save(page,state);expect(errors).toEqual([]);
 });
}
