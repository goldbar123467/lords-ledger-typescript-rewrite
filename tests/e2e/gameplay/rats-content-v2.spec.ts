import {test,expect,type Page} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

async function enter(page:Page){
 let initial=gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}});
 initial=gameReducer(initial,{type:'SET_TAB',payload:{tab:'map'}});
 initial=gameReducer(initial,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 const decoded=readV2Save(writeV2Save(initial));if(!decoded.ok)throw new Error(decoded.error);
 const state=decoded.state,errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
 const visited=gameReducer(state,{type:'TAVERN_VISIT'});
 await page.getByRole('button',{name:/Rats in the Cellar/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 const seen=gameReducer(visited,{type:'TAVERN_RATS_SCRIBES_NOTE_SEEN'});
 await expect(page.getByRole('button',{name:'Ready!',exact:true})).toBeVisible();return {state,seen,errors};
}
async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}

test('a zero-catch phone run accounts for all sixteen rats and saves once',async({page},info)=>{
 test.setTimeout(60_000);await page.setViewportSize({width:390,height:844});const loaded=await enter(page);
 await page.getByRole('button',{name:'Ready!',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cellar Cleared',exact:true})).toBeVisible({timeout:30_000});
 await expect(page.getByText('Caught',{exact:true}).locator('..')).toHaveText('0Caught');
 await expect(page.getByText('Escaped',{exact:true}).locator('..')).toHaveText('16Escaped');
 const expected=gameReducer(loaded.seen,{type:'TAVERN_RATS_FINISH',payload:{caught:0,escaped:16,seed:loaded.seen.rngState}});
 expect(expected.denarii).toBe(700);expect(expected.food).toBe(448);expect(expected.inventory.grain).toBe(318);expect(expected.rngState).toBe(3087660854);
 await page.screenshot({path:info.outputPath('zero-catch-phone.png')});
 await page.getByRole('button',{name:'Collect and Return',exact:true}).click();await save(page,expected);
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();await expect(page.getByRole('button',{name:/Rats in the Cellar/})).toBeDisabled();
 expect(loaded.errors).toEqual([]);
});

test('Load during the cellar countdown leaves no pending rat run',async({page},info)=>{
 const loaded=await enter(page);await page.getByRole('button',{name:'Ready!',exact:true}).click();
 await expect(page.getByText('Ready...',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('button',{name:'Ready!',exact:true})).toHaveCount(0);
 // Real time beyond the next countdown deadline, without advancing the browser clock.
 await page.waitForTimeout(1200);await expect(page.getByRole('button',{name:/Rat in cell/})).toHaveCount(0);await save(page,loaded.state);
 await page.screenshot({path:info.outputPath('cancelled-countdown.png')});expect(loaded.errors).toEqual([]);
});
