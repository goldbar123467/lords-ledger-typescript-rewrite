import {hitRhythm} from '../forgeRhythm.ts';
import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {FORGEABLE_ITEMS,FORGING_DIFFICULTY} from '../../../src/data/blacksmith.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
for(const itemId of ['dagger','longsword','halberd','silver_inlaid_dagger'] as const)
test(`direct selector cancel and ${itemId} full rhythm`,async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 const recipe=FORGEABLE_ITEMS[itemId],config=FORGING_DIFFICULTY[recipe.difficulty];
 await page.setViewportSize({width:1366,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});
 async function selectView(){await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();await expect(page.getByRole('heading',{name:'Choose What to Forge',exact:true})).toBeVisible();}
 await selectView();
 for(const item of Object.values(FORGEABLE_ITEMS))await expect(page.getByRole('button').filter({has:page.getByText(item.name,{exact:true})})).toHaveCount(1);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
 const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
 await selectView();await page.getByRole('button').filter({has:page.getByText(recipe.name,{exact:true})}).click();await expect(page.getByRole('heading',{name:'Heating the Metal',exact:true})).toBeVisible();
 await page.clock.runFor(3200);
 await expect(page.getByText(`Strike 1 of ${config.strikes}`,{exact:true})).toBeVisible();
 async function target(center:number,speed:number){await hitRhythm(page,center,speed);}
 for(let i=0;i<config.strikes;i++){await target(325,500/config.tempo);await page.clock.runFor(250);await page.clock.runFor(450);}
 await expect(page.getByRole('heading',{name:'Quench the Steel',exact:true})).toBeVisible();await target(250,.45);await page.clock.runFor(2100);
 await expect(page.getByText('Perfect Strikes',{exact:true}).locator('..')).toHaveText('Perfect Strikes'+config.strikes);await expect(page.getByText('Missed',{exact:true}).locator('..')).toHaveText('Missed0');await expect(page.getByText('Quality',{exact:true}).locator('..')).toHaveText('Quality100%');
 await page.getByText('Perfect Strikes',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('result.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Collect Item',exact:true}).click();state=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId,qualityScore:100,completionUid:1}});await page.getByRole('button',{name:'Store in Armory',exact:true}).click();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));await page.clock.resume();await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
