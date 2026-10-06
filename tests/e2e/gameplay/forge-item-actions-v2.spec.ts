import {expect,test} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {getBuyerPrice,SEASONAL_BUYERS} from '../../../src/data/blacksmith.ts';
const scenarios=['equip','sell','scrap','arms_dealer','foreign_merchant','mortimer_agent'] as const;
for(const width of [390,1366])for(const scenario of scenarios)test('Forge owned-item '+scenario+' preserves exact state '+width,async({page},info)=>{
 const initial={...createInitialState(104),phase:'management',activeTab:'forge',tutorialsSeen:['forge']};
 const forged=gameReducer(initial,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:scenario==='foreign_merchant'?'plowshare':'longsword',qualityScore:90,completionUid:1}});
 const base={...forged,...(scenario==='mortimer_agent'?{turn:4,season:'winter'}:{}),greatHall:{...forged.greatHall,compoundFlags:{...forged.greatHall.compoundFlags,welcomedHenrik:scenario==='foreign_merchant'}}};
 const visited=gameReducer(base,{type:'BLACKSMITH_VISIT'}),item=base.blacksmith.inventory[0],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(base));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Armory$/})}).click();
 let type:string,buyerId:string|undefined;
 if(scenario==='equip'||scenario==='sell'||scenario==='scrap'){
  await page.getByText(item.name,{exact:true}).first().click();await page.getByRole('button',{name:scenario[0]?.toUpperCase()+scenario.slice(1),exact:true}).click();type=scenario==='equip'?'BLACKSMITH_EQUIP_ITEM':scenario==='sell'?'BLACKSMITH_SELL_ITEM':'BLACKSMITH_SCRAP_ITEM';
 }else{
  const buyer=SEASONAL_BUYERS.find(b=>b.id===scenario);if(!buyer)throw Error('Missing buyer');const card=page.getByRole('heading',{name:buyer.name,exact:true}).locator('..').locator('..').locator('..');
  await card.getByRole('button',{name:`${item.name} (${getBuyerPrice(buyer,item,visited.blacksmith.salesThisSeason)}d)`,exact:true}).click();type='BLACKSMITH_SELL_ITEM';buyerId=scenario;
 }
 await page.screenshot({path:info.outputPath('confirmation.png'),animations:'disabled'});await page.getByRole('button',{name:scenario==='equip'||scenario==='sell'||scenario==='scrap'?'Confirm':'Sell',exact:true}).click();
 const expected=gameReducer(visited,{type,payload:{itemUid:1,...(buyerId?{buyerId}:{})}});await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('settled.png'),animations:'disabled'});expect(errors).toEqual([]);
});
