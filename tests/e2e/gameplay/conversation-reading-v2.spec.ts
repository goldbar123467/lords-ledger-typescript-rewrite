import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

for(const width of [390,1366])for(const kind of ['bard','marta','aldric','marta-poor'] as const)test(`Conversation reading ${kind} ${width}`,async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{seed:104,difficulty:'easy'}});
 state=gameReducer(gameReducer(state,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 const bard=kind==='bard',marta=kind.startsWith('marta');
 state={...state,denarii:kind==='marta-poor'?0:700,tavern:{...state.tavern,
  bardCurrentContent:{type:'riddle',id:'salt_trade',optionOrder:[2,0,1],answer:null,awarded:false},
  martaScribesNoteSeen:true,aldricScribesNoteSeen:true,
  martaCurrentContent:{type:'offer',offerId:'storage_deal',resolution:null},
  aldricCurrentContent:{type:'offer',offerId:'basic_drill',resolution:null}}};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:width===390?844:768});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});
 await page.getByRole('button',{name:bard?/The Bard's Corner/:marta?/Marta the Merchant/:/Old Aldric/}).click();
 if(bard){
  const pending=page.getByRole('button',{name:'Honey',exact:true});await pending.hover();
  await expect(pending).toHaveCSS('background-color','rgb(42, 35, 24)');await expect(pending).toHaveCSS('border-color','rgb(196, 162, 74)');
  await page.getByRole('button',{name:'Ice',exact:true}).press('Enter');state=gameReducer(state,{type:'TAVERN_BARD_ANSWER',payload:{option:'Ice'}});expect(state.denarii).toBe(700);
 }
 await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
 const target=page.getByRole('button',{name:bard?'Tell me more...':'Talk Again',exact:true});
 await expect.poll(async()=>{await target.evaluate(element=>{const box=element.getBoundingClientRect();window.scrollTo({top:scrollY+box.top+box.height/2-innerHeight/2,behavior:'instant'});});const box=await target.boundingBox();return box!==null&&box.y>=0&&box.y+box.height<=(width===390?844:768);}).toBe(true);
 await page.screenshot({path:info.outputPath(`${kind}.png`)});
 const metrics=await target.evaluate(element=>{const style=getComputedStyle(element);return{font:parseFloat(style.fontSize),color:style.color,background:style.backgroundColor};});
 writeFileSync(info.outputPath('metrics.json'),JSON.stringify(metrics,null,2));
 if(kind==='marta-poor'){
  await expect(page.getByText('You need 50d to expand your storage.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Accept',exact:true})).toHaveCount(0);
 }
 expect(metrics.font).toBeGreaterThanOrEqual(16);
 if(bard)for(const name of ['Salt','Ice','Honey']){const option=page.getByRole('button',{name,exact:true});await expect(option).toBeDisabled();await expect(option).toHaveCSS('opacity','1');}
 else if(kind!=='marta-poor'){
  await expect(target).toBeDisabled();await expect(target).toHaveCSS('color','rgb(219, 199, 168)');
  const before=state.denarii;await page.getByRole('button',{name:'Accept',exact:true}).press('Enter');
  state=marta?gameReducer(state,{type:'TAVERN_MARTA_ACCEPT_OFFER',payload:{offerId:'storage_deal'}}):gameReducer(state,{type:'TAVERN_ALDRIC_ACCEPT_OFFER',payload:{offerId:'basic_drill'}});
  expect(state.denarii).toBe(before-(marta?50:30));await expect(page.getByText(marta?'The deal is struck.':'It is done.',{exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
