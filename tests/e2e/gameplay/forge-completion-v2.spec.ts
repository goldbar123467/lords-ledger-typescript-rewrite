import {expect,test} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
for(const width of [390,1366])test('Forge zero-quality minigame collects one canonical item and persists '+width,async({page},info)=>{
 test.setTimeout(65000);
 const base={...createInitialState(104),phase:'management' as const,activeTab:'forge',tutorialsSeen:['forge']};let expected=gameReducer(base,{type:'BLACKSMITH_VISIT'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(base));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();
 await page.locator('button').filter({has:page.getByText('Dagger',{exact:true})}).click();
 // Allow all six strikes and the quench to miss through the real animation/timer path.
 await expect(page.getByRole('button',{name:'Collect Item',exact:true})).toBeVisible({timeout:35000});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('minigame-zero.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Collect Item',exact:true}).click();await expect(page.getByText('Quality: 0% | Broken',{exact:true})).toBeVisible();
 await expect(page.getByText('MILITARY',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Equip Garrison',exact:true})).toBeDisabled();await expect(page.getByRole('status').filter({hasText:'Provides no defense bonus.'})).toBeVisible();await page.screenshot({path:info.outputPath('destination-zero.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Store in Armory',exact:true}).click();
 expected=gameReducer(expected,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:0,completionUid:1}});
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Armory$/})}).click();await expect(page.getByText('Dagger',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});

for(const width of [390,1366])test('Load discards a mounted Forge attempt before its captured UID can affect the loaded estate '+width,async({page})=>{
 const base={...createInitialState(104),phase:'management' as const,activeTab:'forge',tutorialsSeen:['forge']},raw=writeV2Save(base);
 await page.setViewportSize({width,height:844});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();await page.locator('button').filter({has:page.getByText('Dagger',{exact:true})}).click();await expect(page.getByRole('heading',{name:'Heating the Metal',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('button',{name:'Pump Bellows',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Heating the Metal',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Collect Item',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(gameReducer(base,{type:'BLACKSMITH_VISIT'})));
});
for(const width of [390,1366])test('Direct Forge selector requires recipe gold as well as materials '+width,async({page},info)=>{
 const base={...createInitialState(104),phase:'management' as const,activeTab:'forge',tutorialsSeen:['forge'],denarii:0};await page.setViewportSize({width,height:844});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(base));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();await page.screenshot({path:info.outputPath('underfunded-selector.png'),fullPage:true,animations:'disabled'});
 await expect(page.locator('button').filter({has:page.getByText('Dagger',{exact:true})})).toBeDisabled();
});
