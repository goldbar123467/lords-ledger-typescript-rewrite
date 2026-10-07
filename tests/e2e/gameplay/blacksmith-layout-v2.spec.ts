import {test,expect,type Locator,type Page} from '@playwright/test';
import {forgePanelFixture} from '../../fixtures/forgePanel.ts';
import {gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

async function load(page:Page,root:number){
 const state=forgePanelFixture();
 await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(state));
 await page.goto('/');await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',root);
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();
 return gameReducer(state,{type:'BLACKSMITH_VISIT'});
}
async function captionFits(control:Locator,selector?:string){
 const result=await control.evaluate((el,selector)=>{
  const caption=selector?el.querySelector(selector):el;if(!caption)throw Error('Missing caption');
  const range=document.createRange();range.selectNodeContents(caption);const frame=el.getBoundingClientRect();
  const glyphs=[...range.getClientRects()];
  return {inside:glyphs.every(r=>r.left>=frame.left&&r.right<=frame.right&&r.top>=frame.top&&r.bottom<=frame.bottom),lines:[...new Set(glyphs.map(r=>Math.round(r.top)))].length};
 },selector);
 expect(result.inside).toBe(true);expect(result.lines).toBe(1);
}
for(const width of [390,1366])for(const root of [16,32]){
 const name=`${width} root${root}`;
 test(`Forge native navigation captions ${name}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?600:768});await load(page,root);
  const nav=page.getByRole('navigation',{name:'Forge',exact:true});
  for(const label of ['Workshop','Forging','Armory','Orders','Storefront','Ledger']){
   const button=nav.getByRole('button',{name:label,exact:true});
   for(let i=0;i<150&&!(await button.evaluate(el=>el===document.activeElement));i++)await page.keyboard.press('Tab');
   await expect(button).toBeFocused();await page.waitForTimeout(80);await captionFits(button,'span');
   expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return [.05,.5,.95].every(p=>el.contains(document.elementFromPoint(r.left+r.width*p,r.top+r.height/2)));})).toBe(true);
   await page.screenshot({path:info.outputPath(label+'.png'),animations:'disabled'});
   await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-current','page');
  }
 });
 test(`Forge whole category captions ${name}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?600:768});await load(page,root);
  await page.getByRole('navigation',{name:'Forge'}).getByRole('button',{name:'Orders',exact:true}).click();
  for(const label of ['⚔ Weapons','⛊ Armor','⚒ Tools','⚖ Trade Goods']){const button=page.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();await captionFits(button);}
  await page.screenshot({path:info.outputPath('categories.png'),animations:'disabled'});
 });
 test(`Forge whole quality history and enlarged confirmation ${name}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?600:768});const state=await load(page,root);
  const nav=page.getByRole('navigation',{name:'Forge'});await nav.getByRole('button',{name:'Ledger',exact:true}).click();
  const heading=page.getByText('Quality Trend (Last 5)',{exact:true}),chart=heading.locator('..');
  const numbers=chart.locator('span');await expect(numbers).toHaveCount(5);
  for(const number of await numbers.all()){await expect(number).toHaveText('70');await captionFits(number);}
  expect(await chart.evaluate(el=>{const heading=el.firstElementChild;if(!heading)throw Error('Missing heading');const bottom=heading.getBoundingClientRect().bottom;return [...el.querySelectorAll('span')].every(span=>span.getBoundingClientRect().top>=bottom);})).toBe(true);
  await heading.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('quality.png'),animations:'disabled'});
  await nav.getByRole('button',{name:'Armory',exact:true}).click();await page.getByRole('button',{name:'Select Fine Dagger',exact:true}).first().click();
  const trigger=page.getByRole('button',{name:'Equip',exact:true}).first();await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading')).toBeFocused();
  for(const label of ['Confirm','Cancel']){await page.keyboard.press('Tab');const button=dialog.getByRole('button',{name:label,exact:true});await expect(button).toBeFocused();await captionFits(button);await page.screenshot({path:info.outputPath(label+'.png'),animations:'disabled'});}
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await page.getByRole('button',{name:'Save game',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
 });
}
