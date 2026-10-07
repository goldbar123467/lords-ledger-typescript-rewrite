import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

for(const width of [390,1366])for(const view of ['note','wager','result','choice'] as const)test(`Gambit reading ${view} ${width}`,async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{seed:104,difficulty:'normal'}});
 state=gameReducer(gameReducer(state,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 state={...state,denarii:view==='wager'?10:500,rngState:1,tavern:{...state.tavern,gambitScribesNoteSeen:view!=='note'}};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:width===390?844:768});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});
 await page.getByRole('button',{name:/Knight's Gambit/}).click();
 const target=page.getByRole('button',{name:view==='note'?'I understand':view==='wager'?'100d':view==='choice'?'Choose Shield':'Another Round',exact:true});
 if(view==='choice'){
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  await page.getByRole('button',{name:'10d',exact:true}).click();
 }
 if(view==='result'){
  await page.getByRole('button',{name:'10d',exact:true}).click();await page.getByRole('button',{name:'Choose Shield',exact:true}).click();
  await expect(page.getByText('VICTORY',{exact:true})).toBeVisible();
  state=gameReducer(state,{type:'TAVERN_GAMBIT_PLAY',payload:{choice:'shield',wager:10,seed:state.rngState}});expect(state.denarii).toBe(510);
 }
 await target.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
 await page.screenshot({path:info.outputPath(`${view}.png`),animations:'disabled'});
 const metrics=await target.evaluate(element=>{const style=getComputedStyle(element);return{font:parseFloat(style.fontSize),opacity:Number(style.opacity),color:style.color};});
 writeFileSync(info.outputPath('metrics.json'),JSON.stringify(metrics,null,2));
 if(view==='wager'){await expect(target).toBeDisabled();await expect(page.getByRole('button',{name:'10d',exact:true})).toBeEnabled();expect(metrics.opacity).toBe(1);}
 expect(metrics.font).toBeGreaterThanOrEqual(16);
 if(view==='result'){
  const walk=page.getByRole('button',{name:'Walk Away',exact:true});await walk.hover();
  await expect(walk).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(walk).toHaveCSS('border-color','rgb(168, 144, 112)');
 }
 if(view==='choice')for(const name of ['Sword','Shield','Arrow']){
  const bounds=await page.getByRole('button',{name:'Choose '+name,exact:true}).evaluate(button=>{
   const label=button.querySelector('span:last-child');if(!label)throw new Error('Missing weapon label');
   const range=document.createRange();range.selectNodeContents(label);const glyph=range.getBoundingClientRect(),box=button.getBoundingClientRect();
   return{font:parseFloat(getComputedStyle(label).fontSize),glyph:{left:glyph.left,right:glyph.right,top:glyph.top,bottom:glyph.bottom},box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom}};
  });
  writeFileSync(info.outputPath(`bounds-${name}.json`),JSON.stringify(bounds,null,2));
  expect(bounds.font).toBe(32);expect(bounds.glyph.left).toBeGreaterThanOrEqual(bounds.box.left);expect(bounds.glyph.right).toBeLessThanOrEqual(bounds.box.right);
  expect(bounds.glyph.top).toBeGreaterThanOrEqual(bounds.box.top);expect(bounds.glyph.bottom).toBeLessThanOrEqual(bounds.box.bottom);
  expect(bounds.box.left).toBeGreaterThanOrEqual(0);expect(bounds.box.right).toBeLessThanOrEqual(width);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
