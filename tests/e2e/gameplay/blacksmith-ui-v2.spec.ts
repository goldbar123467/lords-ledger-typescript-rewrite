import {test,expect,type Locator,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {forgePanelFixture} from '../../fixtures/forgePanel.ts';
import {gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {FORGEABLE_ITEMS,ITEM_CATEGORIES,getBuyerPrice,SEASONAL_BUYERS} from '../../../src/data/blacksmith.ts';
import {getForgeResourceQuote} from '../../../src/engine/forgeAncillaryActions.ts';
async function load(page:Page){const state=forgePanelFixture();await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();return gameReducer(state,{type:'BLACKSMITH_VISIT'});}
async function readable(locator:Locator){
 const computed=await locator.evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color}));expect(computed.font).toBeGreaterThanOrEqual(14);
 const match=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(computed.color);if(!match)throw Error('Unrecognized text color');
 const linear=(n:number)=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
 const luminance=(r:number,g:number,b:number)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b);
 const foreground=luminance(Number(match[1]),Number(match[2]),Number(match[3])),coal=luminance(58,54,50);
 expect((Math.max(foreground,coal)+.05)/(Math.min(foreground,coal)+.05)).toBeGreaterThanOrEqual(4.5);
}
for(const width of [390,1280,1366,1920])test(`Forge named navigation and readable catalog ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:width===1920?1080:768});if(width===1366)await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let state=await load(page);
 const navigation=page.getByRole('navigation',{name:'Forge',exact:true});
 for(const label of ['Workshop','Forging','Armory','Orders','Storefront','Ledger']){
  const control=navigation.getByRole('button',{name:label,exact:true});await expect(control).toBeVisible();await readable(control);const rect=await control.boundingBox();if(!rect)throw Error('Missing nav rectangle');expect(rect.height).toBeGreaterThanOrEqual(44);await control.click();await expect(control).toHaveAttribute('aria-current','page');
 }
 await navigation.getByRole('button',{name:'Orders',exact:true}).click();
 for(const category of ITEM_CATEGORIES){await page.getByRole('button',{name:category.icon+' '+category.label,exact:true}).click();
  for(const item of Object.values(FORGEABLE_ITEMS).filter(item=>item.category===category.id)){await expect(page.getByRole('heading',{name:item.name,exact:true})).toBeVisible();const description=page.getByText(item.description,{exact:true});await expect(description).toBeVisible();await readable(description);}
 }
 await page.screenshot({path:info.outputPath('catalog.png'),fullPage:true,animations:'disabled'});
 await navigation.getByRole('button',{name:'Storefront',exact:true}).click();const iron=page.getByTestId('forge-resource-iron');await iron.getByRole('group',{name:'Iron quantity',exact:true}).getByRole('button',{name:'5',exact:true}).click();const price=getForgeResourceQuote('iron',state.season,state.blacksmith);if(price===null)throw Error('Missing quote');
 const buy=iron.getByRole('button',{name:`Buy 5 (${price*5}d)`,exact:true});await readable(buy);await buy.click();state=gameReducer(state,{type:'BLACKSMITH_BUY_RESOURCE',payload:{resource:'iron',quantity:5}});
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));await page.screenshot({path:info.outputPath('storefront.png'),fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
});
for(const width of [390,1366])for(const action of ['equip','sell','scrap','buyer'] as const)test(`Forge native ${action} confirmation ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let state=await load(page);await page.getByRole('navigation',{name:'Forge',exact:true}).getByRole('button',{name:'Armory',exact:true}).click();
 let trigger:Locator;
 if(action==='buyer'){const buyer=SEASONAL_BUYERS.find(b=>b.id==='arms_dealer');if(!buyer)throw Error('Missing buyer');const item=state.blacksmith.inventory[0];if(!item)throw Error('Missing item');const price=getBuyerPrice(buyer,item,state.blacksmith.salesThisSeason);trigger=page.getByRole('button',{name:`Dagger (${price}d)`,exact:true}).first();}
 else{await page.getByRole('button',{name:'Select Fine Dagger',exact:true}).first().click();trigger=page.getByRole('button',{name:action==='equip'?'Equip':action==='sell'?'Sell':'Scrap',exact:true}).first();}
 await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();expect(await dialog.evaluate(el=>el.matches(':modal'))).toBe(true);await expect(dialog.getByRole('heading')).toBeFocused();
 const confirm=dialog.getByRole('button',{name:action==='buyer'?'Sell':'Confirm',exact:true}),cancel=dialog.getByRole('button',{name:'Cancel',exact:true});await readable(confirm);
 await page.keyboard.press('Tab');await expect(confirm).toBeFocused();await page.keyboard.press('Tab');await expect(cancel).toBeFocused();await page.keyboard.press('Tab');await expect(confirm).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(cancel).toBeFocused();
 const saved=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'));await page.locator('button[aria-label="Save game"]').evaluate(el=>el.focus());await expect(cancel).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);
 await page.screenshot({path:info.outputPath('confirmation.png'),animations:'disabled'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await page.keyboard.press('Enter');await expect(dialog.getByRole('heading')).toBeFocused();await page.keyboard.press('Tab');await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);
 const type=action==='equip'?'BLACKSMITH_EQUIP_ITEM':action==='scrap'?'BLACKSMITH_SCRAP_ITEM':'BLACKSMITH_SELL_ITEM';state=gameReducer(state,{type,payload:{itemUid:1,...(action==='buyer'?{buyerId:'arms_dealer'}:{})}});
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
 writeFileSync(info.outputPath('result.json'),JSON.stringify({width,action,exactSaveReload:true},null,2));
});
