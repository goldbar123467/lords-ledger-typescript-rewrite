import type {GameSnapshot} from '../../../src/save/saveGame.ts';
import {expect,test} from '@playwright/test';
import disputes from '../../../src/data/disputes.ts';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';

for(const width of [390,1366])test(`later solo dispute is reachable and saveable at ${width}px`,async({page},info)=>{
  const decision=disputes.find(d=>d.id==='dispute_015');if(!decision)throw new Error('Missing solo decision');
  let state: GameSnapshot={...createInitialState(104),phase:'management' as const,turn:4,season:'winter' as const,activeTab:'hall',tutorialsSeen:['hall']};
  for(const prior of disputes){if(prior.id===decision.id)break;if(prior.season==='any'||prior.season==='winter')state=gameReducer(state,{type:'HALL_RULE_DISPUTE',payload:{disputeId:prior.id,rulingId:prior.rulings[0].id}});}
  const raw=writeV2Save(state),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:844});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(decision.title)}).click();await page.getByRole('button',{name:'Hear the Case',exact:true}).click();
  await expect(page.getByText(decision.description,{exact:true})).toBeVisible();
  const ruling=decision.rulings[0];await page.getByRole('button',{name:new RegExp(ruling.label)}).click();
  await expect(page.getByText(ruling.aftermath,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('solo-aftermath.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Save game',exact:true}).click();const saved=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'));if(!saved)throw new Error('Missing save');
  const loaded=readV2Save(saved);if(!loaded.ok)throw new Error(loaded.error);
  expect(loaded.state.greatHall).toEqual(gameReducer(state,{type:'HALL_RULE_DISPUTE',payload:{disputeId:decision.id,rulingId:ruling.id}}).greatHall);expect(loaded.state.rngState).toBe(state.rngState);expect(errors).toEqual([]);
});
