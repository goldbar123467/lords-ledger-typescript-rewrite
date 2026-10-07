import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

for(const width of [390,1366])for(const profile of ['sparse','long'] as const){
 test(`Chronicle heading and local reading ${width} ${profile}`,async({page},info)=>{
  const started=gameReducer(createInitialState(104),{type:'START_GAME',payload:{seed:104,difficulty:'normal'}});
  const state:GameSnapshot={...started,tutorialsSeen:['estate','chronicle'],...(profile==='long'?{chronicle:Array.from({length:60},(_,index)=>({year:1,season:'spring' as const,type:'system' as const,text:`Record ${index+1}: the steward records an estate decision and its effect on the manor, preserving the full account for the next season.`}))}:{})};
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:width===1366?768:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await page.getByRole('button',{name:'Chronicle tab',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  let oldY=NaN,stable=0;
  await expect.poll(async()=>{const y=await page.evaluate(()=>scrollY);stable=Math.abs(y-oldY)<.1?stable+1:0;oldY=y;return stable;},{intervals:[50],timeout:4000}).toBeGreaterThanOrEqual(4);
  const heading=page.getByText('Chronicle of Your Reign',{exact:true});
  const metrics=await heading.evaluate(element=>{
   const header=document.querySelector('.game-header[data-pinned="true"]');
   const footer=document.querySelector('.sticky.bottom-0');
   const rect=element.getBoundingClientRect();
   return{top:rect.top,bottom:rect.bottom,readingTop:header?Math.max(0,header.getBoundingClientRect().bottom):0,readingBottom:footer?Math.min(innerHeight,footer.getBoundingClientRect().top):innerHeight,scrollY,viewport:innerHeight};
  });
  writeFileSync(info.outputPath('metrics.json'),JSON.stringify(metrics,null,2));
  await page.screenshot({path:info.outputPath('initial-viewport.png'),animations:'disabled'});
  expect(metrics.top,'Chronicle heading must begin below pinned controls').toBeGreaterThanOrEqual(metrics.readingTop);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.readingBottom);
  const log=page.getByRole('region',{name:'Chronicle entries',exact:true});
  await page.getByRole('button',{name:'Chronicle tab (active)',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(log).toBeFocused();
  if(profile==='long'){
   await page.keyboard.press('End');
   await expect.poll(()=>log.evaluate(element=>element.scrollHeight-element.clientHeight-element.scrollTop)).toBeLessThanOrEqual(1);
   const first=state.chronicle[0];if(!first)throw new Error('Missing managed oldest entry');const oldest=log.getByText(first.text,{exact:true});
   const bounds=await oldest.boundingBox();if(!bounds)throw new Error('Missing oldest entry');
   expect(bounds.y+bounds.height).toBeLessThanOrEqual(metrics.readingBottom);
   await page.screenshot({path:info.outputPath('oldest-focused.png'),animations:'disabled'});
   await page.keyboard.press('Home');
   await expect.poll(()=>log.evaluate(element=>element.scrollTop)).toBe(0);
  }
  await expect(log).toHaveCSS('scroll-behavior','auto');
  const expected=gameReducer(state,{type:'SET_TAB',payload:{tab:'chronicle'}});
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));
  expect(errors).toEqual([]);
 });
}
