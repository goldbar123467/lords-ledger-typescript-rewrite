import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

const base=gameReducer(gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}}),{type:'DISMISS_TUTORIAL',payload:{tab:'estate'}});
const building={instanceId:'building-save-coal',type:'coal_pit',condition:100,builtOnTurn:0};
for(const format of ['v2','legacy'] as const)for(const flag of ['false',null]){
 test(`Building malformed waiver ${format} ${String(flag)} leaves stored bytes untouched`,async({page},info)=>{
  const state={...base,buildings:[{...building,freeUpkeep:flag}]};
  const raw=JSON.stringify(format==='v2'?{format:'lords-ledger',version:2,state}:state);
  const key=format==='v2'?'lords-ledger-v2-save':'lords-ledger-save',errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:390,height:844});
  await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key,raw});await page.goto('/');
  await page.getByRole('button',{name:format==='v2'?'Load saved game':'Import old save',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('freeUpkeep',{timeout:2000});
  await expect(page.getByRole('heading',{name:'Economy Overview',exact:true})).toHaveCount(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(raw);
  if(format==='legacy')expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBeNull();
  expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('rejected.png'),animations:'disabled'});
 });
}
for(const flag of [undefined,false,true]){
 test(`Building compatible waiver ${String(flag)} retains exact saves and actual charge`,async({page},info)=>{
  const state={...base,buildings:[flag===undefined?building:{...building,freeUpkeep:flag}]};
  const raw=writeV2Save(state),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);await page.goto('/');
  await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  const card=page.getByTestId('built-building-building-save-coal');await card.scrollIntoViewIfNeeded();
  await expect(card.getByText((flag===true?'0':'4')+'d/season',{exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await expect(card.getByText((flag===true?'0':'4')+'d/season',{exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  expect(errors).toEqual([]);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('compatible.png'),animations:'disabled'});
 });
}
