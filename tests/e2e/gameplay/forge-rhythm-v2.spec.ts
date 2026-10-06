import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
// Elapsed rhythm time is controlled. No result or inventory is injected.
for(const width of [390,1366])for(const mode of ['miss','perfect','last-perfect'] as const)
test(`native six-strike ${mode} result and destination ${width}`,async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 await page.setViewportSize({width,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});
 const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Orders$/})}).click();
 await page.getByRole('button',{name:'Commission',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Heating the Metal'})).toBeVisible();
 await page.clock.runFor(3200);await expect(page.getByText('Strike 1 of 6',{exact:true})).toBeVisible();
 async function target(center:number,speed:number){
  const pos=await page.locator('[style*="rotate(45deg)"]').evaluate(el=>parseFloat((el as HTMLElement).style.left)+8);
  await page.clock.runFor(Math.max(0,Math.round((center-pos)/speed)));await page.keyboard.press('Space');
 }
 for(let i=0;i<6;i++){
  if(mode==='perfect'||(mode==='last-perfect'&&i===5)){await target(325,500/900);await page.clock.runFor(250);await page.clock.runFor(450);}
  else await page.clock.runFor(1550);
 }
 await expect(page.getByRole('heading',{name:'Quench the Steel'})).toBeVisible();
 if(mode==='perfect'){await target(250,.45);await page.clock.runFor(2100);}else await page.clock.runFor(3300);
 await expect(page.getByRole('button',{name:'Collect Item',exact:true})).toBeVisible();
 const perfect=mode==='perfect'?6:mode==='last-perfect'?1:0;
 await expect(page.getByText('Perfect Strikes',{exact:true}).locator('..')).toHaveText('Perfect Strikes'+perfect);
 await expect(page.getByText('Missed',{exact:true}).locator('..')).toHaveText('Missed'+(6-perfect));
 await expect(page.getByText('Best Streak',{exact:true}).locator('..')).toHaveText('Best Streak'+perfect);
 const score=mode==='perfect'?100:mode==='last-perfect'?18:0;
 await expect(page.getByText('Quality',{exact:true}).locator('..')).toHaveText('Quality'+score+'%');
 await page.getByText('Perfect Strikes',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('result.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Collect Item',exact:true}).click();
 state=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:score,completionUid:1}});
 if(mode==='perfect'){
  await expect(page.getByRole('button',{name:'Equip Garrison',exact:true})).toBeEnabled();await page.screenshot({path:info.outputPath('destination.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Equip Garrison',exact:true}).click();state=gameReducer(state,{type:'BLACKSMITH_EQUIP_ITEM',payload:{itemUid:1}});
 }else if(mode==='last-perfect'){
  await expect(page.getByRole('button',{name:'Equip Garrison',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Scrap for Parts',exact:true}).click();state=gameReducer(state,{type:'BLACKSMITH_SCRAP_ITEM',payload:{itemUid:1}});
 }else{await expect(page.getByRole('button',{name:'Equip Garrison',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Store in Armory',exact:true}).click();}
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
 await page.clock.resume();await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
