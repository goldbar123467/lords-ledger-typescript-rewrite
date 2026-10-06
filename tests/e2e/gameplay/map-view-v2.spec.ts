import {test,expect,type Page} from '@playwright/test';
import BUILDINGS from '../../../src/data/buildings.ts';
import {mapViewFixture} from '../../fixtures/mapView.ts';
import {gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save,type Season} from '../../../src/save/saveGame.ts';

async function load(page:Page,kind:Parameters<typeof mapViewFixture>[0],season:Season='spring'){
 const state=mapViewFixture(kind,season),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Estate of the Realm',exact:true})).toBeVisible();
 return {state,errors};
}
async function save(page:Page,expected:unknown){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));}
async function capture(page:Page,path:string){
 // Freeze decorative SMIL as well as CSS for comparable authored-map screenshots.
 await page.locator('svg').evaluateAll(elements=>elements.forEach(element=>{if(element instanceof SVGSVGElement){element.pauseAnimations();element.setCurrentTime(0);}}));
 await page.screenshot({path,animations:'disabled',fullPage:true});
}
const colors:Record<Season,string>={spring:'rgb(141, 185, 110)',summer:'rgb(109, 157, 64)',autumn:'rgb(196, 164, 78)',winter:'rgb(200, 200, 192)'};
for(const width of [390,1366]){
 for(const season of ['spring','summer','autumn','winter'] as const)test(`Map authored sprites and seasonal palette ${season} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const {state,errors}=await load(page,'dense',season);
  const map=page.getByRole('heading',{name:'Estate of the Realm',exact:true}).locator('../..');
  // Characterize the sixteen existing sprites; the missing Mill remains an explicit regression below.
  for(const definition of Object.values(BUILDINGS).filter(definition=>definition.id!=='mill'))await expect(map.getByText(definition.name,{exact:true})).toHaveCount(1);
  await expect(map.locator('[style*="aspect-ratio"]')).toHaveCSS('background-color',colors[season]);
  await expect(map.getByText('Castle Lv.3',{exact:true})).toHaveCount(2);
  await capture(page,info.outputPath('map.png'));await save(page,state);expect(errors).toEqual([]);
 });
 for(const kind of ['legacy','empty'] as const)test(`Map ${kind} estate display and exact reload ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const {state,errors}=await load(page,kind);
  if(kind==='legacy')for(const definition of Object.values(BUILDINGS).filter(definition=>definition.id!=='mill'))await expect(page.getByText(definition.name,{exact:true})).toHaveCount(1);
  else{await expect(page.getByText('Build on the Estate tab to see your village grow...',{exact:true})).toBeVisible();for(const name of ['Coal Pit','Tannery','Sawmill','Smelter'])await expect(page.getByText(name,{exact:true})).toHaveCount(1);}
  await capture(page,info.outputPath('map.png'));await save(page,state);await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Estate of the Realm',exact:true})).toBeVisible();await save(page,state);expect(errors).toEqual([]);
 });
 test(`Map callback destinations preserve genuine visits and exact saves ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const loaded=await load(page,'normal');let state=loaded.state;
  await capture(page,info.outputPath('map.png'));
  await page.getByTitle("Enter the Boar's Head Tavern",{exact:true}).click();await expect(page.getByRole('heading',{name:/The Boar.s Head Tavern/})).toBeVisible();
  state=gameReducer(state,{type:'TAVERN_VISIT'});await page.getByRole('button',{name:'Leave Tavern',exact:true}).click();await expect(page.getByRole('heading',{name:'Estate of the Realm',exact:true})).toBeVisible();await save(page,state);
  await page.getByTitle('Climb the Watchtower',{exact:true}).click();await expect(page.getByRole('button',{name:'Descend from Tower',exact:true})).toBeVisible();await page.getByRole('button',{name:'Descend from Tower',exact:true}).click();await expect(page.getByRole('heading',{name:'Estate of the Realm',exact:true})).toBeVisible();await save(page,state);
  await page.getByTitle('Enter the Market Square',{exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'market'}});await expect(page.getByRole('button',{name:'Market tab (active)',exact:true})).toBeVisible();await save(page,state);expect(loaded.errors).toEqual([]);
 });
 test(`Map represents an owned Mill ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:768});const {errors}=await load(page,'dense');
  await expect(page.getByText('Mill',{exact:true})).toHaveCount(1);expect(errors).toEqual([]);
 });
}
