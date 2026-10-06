import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';
import type {GambitWeapon} from '../../../src/engine/tavernGambit.ts';

const beats:Record<GambitWeapon,GambitWeapon>={sword:'arrow',shield:'sword',arrow:'shield'};
const names:Record<GambitWeapon,string>={sword:'Sword',shield:'Shield',arrow:'Arrow'};
const opponents=[{seed:1,opponent:'sword',cursor:1831565814},{seed:4,opponent:'shield',cursor:1831565817},{seed:5,opponent:'arrow',cursor:1831565818}] as const;
for(const [index,player] of (['sword','shield','arrow'] as const).entries())for(const fixture of opponents){
 const wager=[10,25,50,100][(index+fixture.seed)%4];if(wager===undefined)throw new Error('Missing wager fixture');
 const outcome=player===fixture.opponent?'draw':beats[player]===fixture.opponent?'win':'lose';
 test(`Gambit ${player} versus ${fixture.opponent} ${outcome} settles ${wager}d once`,async({page},info)=>{
  let initial=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
  initial=gameReducer(initial,{type:'SET_TAB',payload:{tab:'map'}});initial=gameReducer(initial,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
  // Managed saved cursor and first-round fixture, not a naturally acquired campaign state.
  initial={...initial,rngState:fixture.seed,tavern:{...initial.tavern,gambitScribesNoteSeen:true}};
  const checked=readV2Save(writeV2Save(initial));if(!checked.ok)throw new Error(checked.error);let state=checked.state;
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setViewportSize({width:index===1?390:1366,height:index===1?844:768});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));await page.goto('/');
  await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});expect(state.rngState).toBe(fixture.cursor);
  await page.getByRole('button',{name:/Knight's Gambit/}).click();await page.getByRole('button',{name:wager+'d',exact:true}).click();
  await page.getByRole('button',{name:'Choose '+names[player],exact:true}).click();
  await expect(page.getByText(outcome==='win'?'VICTORY':outcome==='lose'?'DEFEAT':'DRAW',{exact:true})).toBeVisible();
  await expect(page.getByText('You',{exact:true}).locator('..').getByText(names[player],{exact:true})).toHaveCount(1);
  await expect(page.getByText('Stranger',{exact:true}).locator('..').getByText(names[fixture.opponent],{exact:true})).toHaveCount(1);
  const before=state.denarii;state=gameReducer(state,{type:'TAVERN_GAMBIT_PLAY',payload:{choice:player,wager,seed:state.rngState}});
  const expectedCash=before+(outcome==='win'?wager:outcome==='lose'?-wager:0);
  expect(state.denarii).toBe(expectedCash);expect(state.rngState).toBe((fixture.cursor+1831565813)>>>0);
  await page.getByRole('button',{name:'Save game',exact:true}).click();const raw=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save')??'');expect(raw).toBe(writeV2Save(state));
  const saved=readV2Save(raw);if(!saved.ok)throw new Error(saved.error);expect(saved.state.denarii).toBe(expectedCash);expect(saved.state.tavern.gambitRoundsThisSeason).toBe(1);expect(saved.state.tavern.gambitLastChoice).toBe(player);
  await page.screenshot({path:info.outputPath('result.png'),animations:'disabled'});expect(errors).toEqual([]);
 });
}
