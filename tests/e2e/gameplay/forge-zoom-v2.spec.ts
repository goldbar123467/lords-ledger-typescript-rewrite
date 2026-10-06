import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {nativeZoomContext,captureNativeViewport} from '../nativeZoom.ts';
import {hitRhythm} from '../forgeRhythm.ts';
import {focusCollect} from '../forgeFocus.ts';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
test('Forge pointer play at native browser zoom 200 percent',async({baseURL},info)=>{
 if(typeof baseURL!=='string')throw Error('Missing isolated server URL');
 const native=await nativeZoomContext(info.outputPath('native'),baseURL);const context=native.context;
 try{
  const page=context.pages()[0]??await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
  await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});await page.bringToFront();
  const before=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));const zoom=await native.setZoom(2);
  await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBeCloseTo(before.dpr*2,2);
  const after=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom,visualScale:visualViewport?.scale}));
  expect(after.width).toBeCloseTo(before.width/2,0);expect(after.cssZoom).toBe('1');expect(after.visualScale).toBe(1);writeFileSync(info.outputPath('zoom.json'),JSON.stringify({zoom,before,after},null,2));
  const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
  await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();await captureNativeViewport(page,info.outputPath('selector.png')); await page.getByRole('button').filter({has:page.getByText('Dagger',{exact:true})}).click();await page.clock.runFor(3200);
  const visibility=await page.getByRole('button',{name:'Strike the metal',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,viewHeight:innerHeight};});
  writeFileSync(info.outputPath('visibility.json'),JSON.stringify(visibility,null,2));
  expect(visibility.top).toBeGreaterThanOrEqual(0);expect(visibility.bottom).toBeLessThanOrEqual(visibility.viewHeight);
  await captureNativeViewport(page,info.outputPath('strike.png')); for(let i=0;i<6;i++){await hitRhythm(page,325,500/900,'pointer');await page.clock.runFor(250);await page.clock.runFor(450);}
  await hitRhythm(page,250,.45,'pointer');await page.clock.runFor(2100);await expect(page.getByText('Perfect Strikes',{exact:true}).locator('..')).toHaveText('Perfect Strikes6');await expect(page.getByText('Quality',{exact:true}).locator('..')).toHaveText('Quality100%');await captureNativeViewport(page,info.outputPath('result.png'));
  const focus=await focusCollect(page);writeFileSync(info.outputPath('focus.json'),JSON.stringify(focus,null,2));await captureNativeViewport(page,info.outputPath('collect-focused.png'));await page.keyboard.press('Enter');state=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:100,completionUid:1}});await page.getByRole('button',{name:'Store in Armory',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
 }finally{await context.close();}
});
