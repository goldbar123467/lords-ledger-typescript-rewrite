import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.js';
import { writeV2Save } from '../../../src/save/saveGame.ts';
for(const width of [390,1366]) for(const legacy of [false,true]) test('missing Feast flag with current history shows already held at '+width+' effect-only '+legacy, async({page},info)=>{
  const base = { ...createInitialState(104), phase: 'management', activeTab: 'hall', tutorialsSeen: ['hall'] };
  const settled = gameReducer(base,{type:'HALL_FEAST_COMPLETE',payload:{guestId:'village',entertainmentId:'musicians',courseId:'modest',seed:base.rngState}});
  delete settled.greatHall.hasFeastedThisSeason;
  if(legacy) for(const key of ['guestId','entertainmentId','courseId','eventId']) delete settled.greatHall.feastHistory[0][key];
  const raw = writeV2Save(settled);
  await page.setViewportSize({width,height:844});
  await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);
  await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
  await page.getByRole('button',{name:'Feast',exact:true}).click();
  await page.screenshot({path:info.outputPath('missing-flag.png'),fullPage:true});
  await expect(page.getByText('You have already held a feast this season.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
});
