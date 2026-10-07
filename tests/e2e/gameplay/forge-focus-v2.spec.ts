import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {hitRhythm} from '../forgeRhythm.ts';
import {focusCollect} from '../forgeFocus.ts';
for(const viewport of [{width:1366,height:768},{width:390,height:600},{width:390,height:844}])
test(`native Collect keyboard focus ${viewport.width}x${viewport.height}`,async({page},info)=>{
 await page.setViewportSize(viewport);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});
 const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();await page.getByRole('button').filter({has:page.getByText('Dagger',{exact:true})}).click();await page.clock.runFor(3200);
 for(let i=0;i<6;i++){await hitRhythm(page,325,500/900,'enter');await page.clock.runFor(250);await page.clock.runFor(450);}
 await hitRhythm(page,250,.45,'enter');await page.clock.runFor(2100);
 await expect(page.getByText('Perfect Strikes',{exact:true}).locator('..')).toHaveText('Perfect Strikes6');await expect(page.getByText('Quality',{exact:true}).locator('..')).toHaveText('Quality100%');
 const geometry=await focusCollect(page);writeFileSync(info.outputPath('focus.json'),JSON.stringify(geometry,null,2));await page.screenshot({path:info.outputPath('collect-focused.png'),animations:'disabled'});
 await page.keyboard.press('Enter');state=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:100,completionUid:1}});
 await page.getByRole('button',{name:'Store in Armory',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
 await page.clock.resume();await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
