import {expect,test} from '@playwright/test';
import {createInitialState,gameReducer}from'../../../src/engine/gameReducer.ts';
import {writeV2Save}from'../../../src/save/saveGame.ts';
import {FORGEABLE_ITEMS,ITEM_CATEGORIES}from'../../../src/data/blacksmith.ts';
for(const width of [390,1366])test('Forge authored catalog and seeded storefront survive save '+width,async({page},info)=>{
 const base={...createInitialState(104),phase:'management' as const,activeTab:'forge',tutorialsSeen:['forge']},expected=gameReducer(base,{type:'BLACKSMITH_VISIT'}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(base));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Orders$/})}).click();
 for(const category of ITEM_CATEGORIES){await page.getByRole('button',{name:category.icon+' '+category.label,exact:true}).click();
  const items=Object.values(FORGEABLE_ITEMS).filter(i=>i.category===category.id);for(const item of items){await expect(page.getByRole('heading',{name:item.name,exact:true})).toBeVisible();await expect(page.getByText(item.description,{exact:true})).toBeVisible();}
  await page.screenshot({path:info.outputPath(category.id+'.png'),fullPage:true,animations:'disabled'});
 }
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Storefront$/})}).click();await expect(page.getByText('Material Market',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('storefront.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));expect(errors).toEqual([]);
});
