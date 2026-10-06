import {test,expect,type Page} from '@playwright/test';
import {forgePanelFixture} from '../../fixtures/forgePanel.ts';
import {gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {FORGE_AMBIENT_TEXTS} from '../../../src/data/blacksmith.ts';

declare global {
 interface Window {__forgeTimers:{active:Map<number,{kind:'timeout'|'interval';delay:number}>;fired:{kind:'timeout'|'interval';delay:number}[]}}
}
async function load(page:Page){
 const state=forgePanelFixture(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(state));await page.goto('/');
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 // Resolve the lazy Forge first, unmount it, then install and pause the clock before a fresh mount.
 await page.getByRole('button',{name:'Estate tab',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toHaveCount(0);
 await page.getByRole('dialog',{name:'The Estate',exact:true}).getByRole('button',{name:'I Understand',exact:true}).click();
 const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
 // Instrument the browser timer boundary after the clock is installed, before Forge remounts.
 await page.evaluate(()=>{
  const browser:Window=window;
  const active=new Map<number,{kind:'timeout'|'interval';delay:number}>(),fired:{kind:'timeout'|'interval';delay:number}[]=[];
  browser.__forgeTimers={active,fired};
  const timeout=browser.setTimeout.bind(browser),interval=browser.setInterval.bind(browser),clearTimeout=browser.clearTimeout.bind(browser),clearInterval=browser.clearInterval.bind(browser);
  browser.setTimeout=(handler,delay=0,...args)=>{
   if(!new Error().stack?.includes('BlacksmithTab'))return timeout(handler,delay,...args);
   if(typeof handler!=='function')throw Error('Unexpected string Forge timer');
   const id=timeout(()=>{active.delete(id);fired.push({kind:'timeout',delay});handler(...args);},delay);active.set(id,{kind:'timeout',delay});return id;
  };
  browser.setInterval=(handler,delay=0,...args)=>{
   if(!new Error().stack?.includes('BlacksmithTab'))return interval(handler,delay,...args);
   if(typeof handler!=='function')throw Error('Unexpected string Forge interval');
   const id=interval(()=>{fired.push({kind:'interval',delay});handler(...args);},delay);active.set(id,{kind:'interval',delay});return id;
  };
  browser.clearTimeout=id=>{if(id!==undefined)active.delete(id);clearTimeout(id);};
  browser.clearInterval=id=>{if(id!==undefined)active.delete(id);clearInterval(id);};
 });
 await page.getByRole('button',{name:'Forge tab',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 return {state:gameReducer(gameReducer(gameReducer(gameReducer(gameReducer(state,{type:'BLACKSMITH_VISIT'}),{type:'SET_TAB',payload:{tab:'estate'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'estate'}}),{type:'SET_TAB',payload:{tab:'forge'}}),{type:'BLACKSMITH_VISIT'}),errors};
}
async function active(page:Page){return page.evaluate(()=>[...window.__forgeTimers.active.values()]);}
for(const width of [390,1366]){
 test(`Forge ambient fade cancels on leaving ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const {state,errors}=await load(page);
  expect(await active(page)).toContainEqual({kind:'interval',delay:8000});
  await page.clock.runFor(8000);await expect(page.locator('.forge-ambient')).toHaveText(FORGE_AMBIENT_TEXTS[0]??'');
  expect(await active(page)).toContainEqual({kind:'timeout',delay:500});
  await page.getByRole('button',{name:'Estate tab',exact:true}).click();
  expect(await active(page)).toEqual([]);const fired=await page.evaluate(()=>window.__forgeTimers.fired);
  await page.clock.runFor(1000);expect(await page.evaluate(()=>window.__forgeTimers.fired)).toEqual(fired);
  await page.getByRole('button',{name:'Forge tab',exact:true}).click();await expect(page.locator('.forge-ambient')).toHaveText(FORGE_AMBIENT_TEXTS[0]??'');
  await page.clock.runFor(8500);await expect(page.locator('.forge-ambient')).toHaveText(FORGE_AMBIENT_TEXTS[1]??'');
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  const expected=gameReducer(gameReducer(gameReducer(state,{type:'SET_TAB',payload:{tab:'estate'}}),{type:'SET_TAB',payload:{tab:'forge'}}),{type:'BLACKSMITH_VISIT'});
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));
  await page.screenshot({path:info.outputPath('ambient.png'),animations:'disabled'});
  expect(errors).toEqual([]);
 });
 test(`Forge latest bellows reaction and unmount cleanup ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:768});const {state,errors}=await load(page);
  const pump=page.getByRole('button',{name:'Pump Bellows',exact:true});
  for(let i=0;i<15;i++){await pump.click();await expect(pump).toBeDisabled();await page.clock.runFor(500);await expect(pump).toBeEnabled();}
  await pump.click();await expect(page.locator('.forge-bellows-reaction')).toBeVisible();
  expect((await active(page)).filter(t=>t.kind==='timeout'&&t.delay===3000)).toHaveLength(1);
  await page.clock.runFor(2600);await expect(page.locator('.forge-bellows-reaction')).toBeVisible();
  await page.clock.runFor(400);await expect(page.locator('.forge-bellows-reaction')).toHaveCount(0);
  await pump.click();await page.screenshot({path:info.outputPath('bellows.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Estate tab',exact:true}).click();expect(await active(page)).toEqual([]);
  const fired=await page.evaluate(()=>window.__forgeTimers.fired);await page.clock.runFor(4000);expect(await page.evaluate(()=>window.__forgeTimers.fired)).toEqual(fired);
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(gameReducer(state,{type:'SET_TAB',payload:{tab:'estate'}})));
  expect(errors).toEqual([]);
 });
}
