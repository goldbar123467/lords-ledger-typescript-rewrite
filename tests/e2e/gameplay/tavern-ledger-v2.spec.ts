import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';
const decoded=readV2Save(writeV2Save(gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}})));
if(!decoded.ok)throw new Error(decoded.error);const base=decoded.state;
for(const scenario of ['visit','win','lose'] as const)test(`exact large ledger ${scenario} saves and continues after reload`,async({page},info)=>{
 const moved=gameReducer(gameReducer(base,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 const state={...moved,tavern:{...moved.tavern,gambitScribesNoteSeen:true,totalVisits:scenario==='visit'?Number.MAX_SAFE_INTEGER:0,gambitTotalWins:scenario==='visit'?0:Number.MAX_SAFE_INTEGER,gambitTotalLosses:scenario==='visit'?0:Number.MAX_SAFE_INTEGER,gambitNetEarnings:scenario==='lose'?-Number.MAX_SAFE_INTEGER:Number.MAX_SAFE_INTEGER}};
 const raw=writeV2Save(state),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:scenario==='visit'?390:1366,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
 await expect(page.getByRole('button',{name:/Rats in the Cellar/})).toBeVisible();
 const visited=gameReducer(state,{type:'TAVERN_VISIT'});let expected=visited;
 if(scenario!=='visit'){
  await page.getByRole('button',{name:/Knight's Gambit/}).click();await page.getByRole('button',{name:'10d',exact:true}).click();await page.getByRole('button',{name:scenario==='win'?'Choose Arrow':'Choose Sword',exact:true}).click();
  await expect(page.getByText(scenario==='win'?'VICTORY':'DEFEAT',{exact:true})).toBeVisible();
  const played=gameReducer(visited,{type:'TAVERN_GAMBIT_PLAY',payload:{choice:scenario==='win'?'arrow':'sword',wager:10,seed:visited.rngState}});
  expect(played.denarii).toBe(scenario==='win'?710:690);expect(played.rngState).toBe(2143695499);
  expected={...played,tavern:{...played.tavern,gambitTotalWins:scenario==='win'?'9007199254740992':Number.MAX_SAFE_INTEGER,gambitTotalLosses:scenario==='lose'?'9007199254740992':Number.MAX_SAFE_INTEGER,gambitNetEarnings:scenario==='win'?'9007199254741001':'-9007199254741001'}};
 }else expected={...visited,tavern:{...visited.tavern,totalVisits:'9007199254740992'}};
 const expectedRaw=JSON.stringify({format:'lords-ledger',version:2,state:expected});
 await page.getByRole('button',{name:'Save game',exact:true}).click();await expect(page.getByText('Saved!',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(expectedRaw);await page.screenshot({path:info.outputPath('saved.png')});
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(expectedRaw);
 if(scenario==='visit'){
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();await expect(page.getByRole('button',{name:/Rats in the Cellar/})).toBeVisible();await page.getByRole('button',{name:'Save game',exact:true}).click();
  const second=gameReducer(expected,{type:'TAVERN_VISIT'}),secondRaw=JSON.stringify({format:'lords-ledger',version:2,state:{...second,tavern:{...second.tavern,totalVisits:'9007199254740993'}}});
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(secondRaw);
 }
 expect(errors).toEqual([]);
});
