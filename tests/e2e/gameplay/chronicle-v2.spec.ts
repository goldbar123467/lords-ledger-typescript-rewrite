import {test,expect} from '@playwright/test';
import {chronicleFixture} from '../../fixtures/chronicle.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
for(const width of [390,1366])for(const historical of [false,true])test(`Chronicle preserves entries and exact saves ${width} historical${historical}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const state=chronicleFixture(historical),raw=writeV2Save(state);
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw)},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByText('Chronicle of Your Reign',{exact:true})).toBeVisible();
 for(const entry of state.chronicle)await expect(page.getByText(entry.text,{exact:true})).toBeVisible();
 if(historical){await expect(page.getByText('Unknown year Unknown season',{exact:true})).toHaveCount(2);await expect(page.getByText('Y2.5 Flood season',{exact:true})).toBeVisible();}
 await page.screenshot({path:info.outputPath('chronicle.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByText('Chronicle of Your Reign',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);expect(errors).toEqual([]);
});
test('malformed Chronicle save is recoverable without changing saved bytes',async({page})=>{
 const state={...chronicleFixture(),chronicle:[null]},raw=JSON.stringify({format:'lords-ledger',version:2,state});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(raw=>{localStorage.setItem('lords-ledger-v2-save',raw);localStorage.setItem('lords-ledger-save','Original legacy bytes');},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/chronicle/i);
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-save'))).toBe('Original legacy bytes');expect(errors).toEqual([]);
});
