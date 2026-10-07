import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

for(const width of [390,1366])for(const view of ['intro','enlarged','result'] as const)test(`Cellar reading ${view} ${width}`,async({page},info)=>{
 test.setTimeout(60_000);
 let state=gameReducer(createInitialState(1),{type:'START_GAME',payload:{seed:1,difficulty:'easy'}});
 state=gameReducer(gameReducer(state,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 state={...state,tavern:{...state.tavern,ratsScribesNoteSeen:true}};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:width===390?844:768});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});
 await page.getByRole('button',{name:/Rats in the Cellar/}).click();
 if(view==='enlarged')await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
 await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
 if(view==='result'){
  await page.getByRole('button',{name:'Ready!',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cellar Cleared',exact:true})).toBeVisible({timeout:30_000});
  await expect(page.getByText('Caught',{exact:true}).locator('..')).toHaveText('0Caught');
  await expect(page.getByText('Escaped',{exact:true}).locator('..')).toHaveText('16Escaped');
 }
 const target=page.getByRole('button',{name:view==='result'?'Collect and Return':'Not now',exact:true});
 await expect.poll(async()=>{
  await target.evaluate(element=>{const box=element.getBoundingClientRect();window.scrollTo({top:window.scrollY+box.top+box.height/2-innerHeight/2,behavior:'instant'});});
  const box=await target.boundingBox();return box!==null&&box.y>=0&&box.y+box.height<=(width===390?844:768);
 }).toBe(true);
 await page.screenshot({path:info.outputPath(`${view}.png`)});
 const text=view==='result'?page.getByText('Click accuracy',{exact:true}):page.getByText('Click the rats before they escape.',{exact:false});
 const font=await text.evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
 const buttons=await target.locator('..').getByRole('button').evaluateAll(elements=>elements.map(element=>{
  const box=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);const glyph=range.getBoundingClientRect();
  return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,glyphLeft:glyph.left,glyphRight:glyph.right,glyphTop:glyph.top,glyphBottom:glyph.bottom};
 }));
 writeFileSync(info.outputPath('metrics.json'),JSON.stringify({font,buttons},null,2));
 expect(font).toBeGreaterThanOrEqual(view==='enlarged'?32:16);
 for(const box of buttons){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.glyphLeft).toBeGreaterThanOrEqual(box.left);expect(box.glyphRight).toBeLessThanOrEqual(box.right);expect(box.glyphTop).toBeGreaterThanOrEqual(box.top);expect(box.glyphBottom).toBeLessThanOrEqual(box.bottom);}
 await target.press('Enter');
 if(view==='result'){
  state=gameReducer(state,{type:'TAVERN_RATS_FINISH',payload:{caught:0,escaped:16,seed:state.rngState}});
  expect(state.food).toBe(448);expect(state.inventory.grain).toBe(318);expect(state.denarii).toBe(700);expect(state.rngState).toBe(3087660854);
 }
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));expect(errors).toEqual([]);
});
