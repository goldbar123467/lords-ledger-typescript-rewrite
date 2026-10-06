import {expect,test,type Page,type Locator} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
async function tabTo(page:Page,target:Locator){for(let i=0;i<160;i++){if(await target.evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab');}await expect(target).toBeFocused();}
const scenarios=[{width:1366,height:768,root:16},{width:390,height:844,root:16},{width:390,height:600,root:32}];
for(const scenario of scenarios){
 test('Hall navigation keeps enlarged captions and keyboard focus readable '+scenario.width+' '+scenario.root,async({page},info)=>{
  const state={...createInitialState(104),phase:'management',activeTab:'hall',tutorialsSeen:['hall']},raw=writeV2Save(state),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);await page.goto('/');await page.evaluate(root=>document.documentElement.style.fontSize=root+'px',scenario.root);await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  for(const name of ['Throne','Audience','Decrees','Council','Feast','Summary']){
   const button=page.getByRole('button',{name,exact:true});await tabTo(page,button);await page.waitForTimeout(80);await page.screenshot({path:info.outputPath(name+'-focus.png'),animations:'disabled'});
   const geometry=await button.evaluate(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e.querySelector('span')??e);const glyph=range.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {caption:glyph.left>=r.left&&glyph.right<=r.right,font:parseFloat(getComputedStyle(e.querySelector('span')??e).fontSize),hit:!!hit&&(hit===e||e.contains(hit)),outline:getComputedStyle(e).outlineStyle};});
   expect(geometry.caption,name+JSON.stringify(geometry)).toBe(true);expect(geometry.font).toBeGreaterThanOrEqual(scenario.root*.875);expect(geometry.hit,name+JSON.stringify(geometry)).toBe(true);expect(geometry.outline).toBe('solid');
   await page.keyboard.press('Enter');
  }
  await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);expect(errors).toEqual([]);
 });
 test('Hall Summary and stored event read clearly and settle once '+scenario.width+' '+scenario.root,async({page},info)=>{
  const base={...createInitialState(104),phase:'management',activeTab:'hall',tutorialsSeen:['hall']},snapshot={turn:0,season:'winter',year:25,meters:{people:0,treasury:12.5,church:100,military:50}},state={...base,greatHall:{...base.greatHall,meterHistory:[snapshot,snapshot],compoundFlags:{ironRule:true},pendingHallEvent:{type:'crisis',meter:'Old people caption',text:'Older unrest narrative retained in full.',effects:{people:-2.5}}}},raw=writeV2Save(state);
  await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);await page.goto('/');await page.evaluate(root=>document.documentElement.style.fontSize=root+'px',scenario.root);await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.getByRole('button',{name:'Summary',exact:true}).click();
  await page.getByText('+50',{exact:true}).waitFor();await page.screenshot({path:info.outputPath('summary-event.png'),fullPage:true,animations:'disabled'});
  const label=page.locator('.hall-meter').getByText('People',{exact:true});expect(await label.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(scenario.root*.875);
  await expect(page.getByText('+37.5',{exact:true})).toBeVisible();await expect(page.getByText('-50',{exact:true})).toBeVisible();
  const acknowledge=page.getByRole('button',{name:'Acknowledge',exact:true});await tabTo(page,acknowledge);await page.keyboard.press('Enter');await expect(acknowledge).toHaveCount(0);await page.getByRole('button',{name:'Save game',exact:true}).click();
  const expected=writeV2Save(gameReducer(state,{type:'HALL_DISMISS_EVENT'}));expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(expected);
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(acknowledge).toHaveCount(0);await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(expected);
 });
}
