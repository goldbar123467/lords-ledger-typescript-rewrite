import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {hitRhythm} from '../forgeRhythm.ts';
for(const width of [390,1366,1920])for(const input of ['pointer','enter','space'] as const)
test(`visible rhythm zones and ${input} crafting ${width}`,async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 await page.setViewportSize({width,height:width===1920?1080:width===1366?768:844});
 if(width===1366&&input==='enter')await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});
 const time=new Date('2026-10-06T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Orders$/})}).click();await page.getByRole('button',{name:'Commission',exact:true}).first().click();await page.clock.runFor(3200);
 const track=page.locator('.forge-rhythm-indicator,[style*="rotate(45deg)"]').locator('..');
 await track.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:info.outputPath('strike.png'),animations:'disabled'});
 const geometry=await track.evaluate(el=>{const r=el.getBoundingClientRect(),target=el.children[2]?.getBoundingClientRect(),zone=el.children[1]?.getBoundingClientRect();if(!target||!zone)throw Error('Missing target zones');return{ratio:((target.left+target.right)/2-r.left)/r.width,visible:zone.right<=r.right&&zone.left>=r.left};});
 expect(geometry.ratio).toBeCloseTo(.65,2);expect(geometry.visible).toBe(true);
 const strike=page.getByRole('button',{name:'Strike the metal',exact:true});await expect(strike).toBeFocused();
 // Space on a different control must activate that control, not spend a strike.
 await page.getByRole('button',{name:'Save game',exact:true}).focus();await page.keyboard.press('Space');expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));await expect(page.getByText('Strike 1 of 6',{exact:true})).toBeVisible();await strike.focus();
 for(let i=0;i<6;i++){
  const hold=width===390&&input==='space'&&i===0;await hitRhythm(page,325,500/900,input,hold);await page.clock.runFor(250);await page.clock.runFor(450);
  if(hold){await page.keyboard.down('Space');await expect(page.getByRole('listitem',{name:'Strike 2: pending',exact:true})).toHaveCount(1);await page.keyboard.up('Space');await expect(page.getByRole('listitem',{name:'Strike 2: pending',exact:true})).toHaveCount(1);}
 }
 const quench=page.getByRole('button',{name:'Quench the steel',exact:true});await expect(quench).toBeFocused();
 const midpoint=await quench.evaluate(el=>{const r=el.getBoundingClientRect(),line=el.children[2]?.getBoundingClientRect();if(!line)throw Error('Missing quench target');return((line.left+line.right)/2-r.left)/r.width;});expect(midpoint).toBeCloseTo(.5,2);
 await page.screenshot({path:info.outputPath('quench.png'),animations:'disabled'});await hitRhythm(page,250,.45,input);await page.clock.runFor(2100);
 await expect(page.getByText('Perfect Strikes',{exact:true}).locator('..')).toHaveText('Perfect Strikes6');await expect(page.getByText('Quality',{exact:true}).locator('..')).toHaveText('Quality100%');await page.getByText('Quality',{exact:true}).locator('..').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:info.outputPath('result.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Collect Item',exact:true}).click();state=gameReducer(state,{type:'BLACKSMITH_FORGE_COMPLETE',payload:{itemId:'dagger',qualityScore:100,completionUid:1}});await page.getByRole('button',{name:'Store in Armory',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));await page.clock.resume();await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});

test('managed zero-wallet recipe clearly explains its shortfall',async({page},info)=>{
 let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});state=gameReducer(state,{type:'SET_TAB',payload:{tab:'forge'}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'forge'}});
 // A deliberate readable UI stress fixture, not natural startup/acquisition evidence.
 state={...state,denarii:0};await page.setViewportSize({width:390,height:844});
 await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(state));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();state=gameReducer(state,{type:'BLACKSMITH_VISIT'});
 await page.locator('button').filter({has:page.locator('span').filter({hasText:/^Forging$/})}).click();const recipe=page.getByRole('button').filter({has:page.getByText('Dagger',{exact:true})});await expect(recipe).toBeDisabled();await expect(recipe).toContainText('gold: 1 (short)');await expect(recipe).toContainText('More materials or gold are needed.');await recipe.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:info.outputPath('unavailable.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
});
