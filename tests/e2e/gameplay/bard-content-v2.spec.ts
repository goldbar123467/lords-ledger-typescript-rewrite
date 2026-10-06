import {test,expect,type Page} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {BARD_RIDDLES} from '../../../src/data/tavern.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

async function save(page:Page,state:GameSnapshot){
 await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
}
for(const riddle of BARD_RIDDLES)for(const width of [390,1366])for(const correct of [false,true]){
 test(`Bard ${riddle.id} ${correct?'correct':'wrong'} ${width} preserves content and saved answers`,async({page},info)=>{
  let initial=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
  initial=gameReducer(initial,{type:'SET_TAB',payload:{tab:'map'}});
  initial=gameReducer(initial,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
  // Managed pending-content coverage, not a played acquisition or campaign.
  initial={...initial,tavern:{...initial.tavern,bardCurrentContent:{type:'riddle',id:riddle.id,optionOrder:[2,0,1],answer:null,awarded:false}}};
  const checked=readV2Save(writeV2Save(initial));if(!checked.ok)throw new Error(checked.error);let state=checked.state;
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setViewportSize({width,height:width===390?844:768});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});
  await page.getByRole('button',{name:/The Bard's Corner/}).click();await expect(page.getByText(riddle.question,{exact:true})).toBeVisible();
  const buttons=page.getByRole('button').filter({hasText:new RegExp('^('+riddle.options.map(option=>option.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$')});
  expect(await buttons.allTextContents()).toEqual([riddle.options[2],riddle.options[0],riddle.options[1]]);
  for(const button of await buttons.all()){expect((await button.boundingBox())?.height??0).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:info.outputPath('pending.png'),animations:'disabled'});await save(page,state);
  const answer=correct?riddle.answer:riddle.options.find(option=>option!==riddle.answer);if(answer===undefined)throw new Error('Missing wrong answer');
  const before=state.denarii;await page.getByRole('button',{name:answer,exact:true}).click();
  state=gameReducer(state,{type:'TAVERN_BARD_ANSWER',payload:{option:answer}});
  // Independent authored reward arithmetic and once-only answer state.
  expect(state.denarii).toBe(before+(correct?10:0));expect(state.tavern.bardCurrentContent).toEqual({type:'riddle',id:riddle.id,optionOrder:[2,0,1],answer,awarded:correct});
  const response=correct?page.locator('p').filter({has:page.getByText('+10 denarii',{exact:true})}):page.getByText(riddle.wrong,{exact:true});
  await expect(response).toHaveText(correct?riddle.correct+'+10 denarii':riddle.wrong);await expect(response).toBeVisible();
  for(const button of await buttons.all())await expect(button).toBeDisabled();
  await save(page,state);await page.screenshot({path:info.outputPath('answer.png'),animations:'disabled'});
  await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();state=gameReducer(state,{type:'TAVERN_VISIT'});
  await page.getByRole('button',{name:/The Bard's Corner/}).click();state=gameReducer(state,{type:'TAVERN_BARD_NEXT'});
  await expect(page.getByRole('heading',{name:"The Bard's Corner",exact:true})).toBeVisible();
  expect(state.denarii).toBe(before+(correct?10:0));await save(page,state);expect(errors).toEqual([]);
 });
}
