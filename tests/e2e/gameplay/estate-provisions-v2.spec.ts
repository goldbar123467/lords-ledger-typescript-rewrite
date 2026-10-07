import {test,expect,type Page} from '@playwright/test';
import {gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}
for(const width of [390,1366])test(`Estate shows genuinely purchased provisions and exact reload ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.getByRole('button',{name:/Normal.*standard experience/i}).click();await page.getByRole('button',{name:'I Understand',exact:true}).click();
 await page.getByRole('button',{name:'Save game',exact:true}).click();const initial=readV2Save(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save')??''));if(!initial.ok)throw new Error(initial.error);let state=initial.state;
 await expect(page.getByText('Special',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Market tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'market'}});
 await page.getByRole('button',{name:'I Understand',exact:true}).click();state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'market'}});
 await page.getByRole('button',{name:/Agnes the Goodswoman/}).click();await page.getByRole('button',{name:'Buy from Merchant',exact:true}).click();
 for(const [resource,label] of [['salt','Salt'],['tools','Tools'],['spices','Spices']] as const){
  const buy=page.getByTestId('merchant-buy-'+resource).getByRole('button',{name:new RegExp('^Buy 1 '+label+' for ')});
  const quote=(await buy.getAttribute('aria-label'))?.match(/ for ([\d.]+)d$/);if(!quote)throw new Error('Missing purchase quote');const cost=Number(quote[1]);expect(cost).toBeGreaterThan(0);
  const before=state.denarii;await buy.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await buy.click();
  state=gameReducer(state,{type:'BUY_RESOURCE',payload:{resource,quantity:1,merchantId:'agnes'}});expect(state.denarii).toBe(before-cost);expect(state.inventory[resource]).toBe(1);await save(page,state);
 }
 await page.getByRole('button',{name:'Estate tab',exact:true}).click();state=gameReducer(state,{type:'SET_TAB',payload:{tab:'estate'}});
 const inventory=page.getByRole('heading',{name:'Land & Inventory',exact:true}).locator('..');await inventory.evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:info.outputPath('inventory.png'),animations:'disabled'});
 await expect(inventory.getByText('Special',{exact:true})).toHaveCount(1);
 for(const label of ['Salt','Tools','Spices']){
  const chip=inventory.getByText(label,{exact:true}).locator('..');await expect(chip.getByText('1',{exact:true})).toHaveCount(1);
  await chip.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  expect(await chip.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight&&element.contains(document.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2));})).toBe(true);
 }
 await page.screenshot({path:info.outputPath('provisions.png'),animations:'disabled'});await save(page,state);
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(inventory.getByText('Special',{exact:true})).toHaveCount(1);for(const label of ['Salt','Tools','Spices'])await expect(inventory.getByText(label,{exact:true}).locator('..').getByText('1',{exact:true})).toHaveCount(1);await save(page,state);expect(errors).toEqual([]);
});
