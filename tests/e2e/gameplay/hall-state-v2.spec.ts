import {expect,test}from'@playwright/test';
import {createInitialState}from'../../../src/engine/gameReducer.js';
import {writeV2Save}from'../../../src/save/saveGame.ts';
function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
for(const field of ['reputation','meterHistory'])test('damaged '+field+' is rejected before Hall rendering',async({page},info)=>{
 const state={...createInitialState(104),phase:'management',activeTab:'hall',tutorialsSeen:['hall']};
 const envelope:unknown=JSON.parse(writeV2Save(state));if(!record(envelope)||!record(envelope.state)||!record(envelope.state.greatHall))throw Error('Invalid fixture');
 const damage=field==='reputation'?{}:[null,{turn:0,season:'spring',year:1,meters:{people:50,treasury:50,church:50,military:50}}];
 const raw=JSON.stringify({...envelope,state:{...envelope.state,greatHall:{...envelope.state.greatHall,[field]:damage}}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);await page.goto('/');
 const load=page.getByRole('button',{name:'Load saved game',exact:true});
 await load.click();const summary=page.getByRole('button',{name:'Summary',exact:true});
 if(field==='meterHistory'&&await summary.isVisible())await summary.click();await page.waitForTimeout(250);
 await page.screenshot({path:info.outputPath('damaged-'+field+'.png'),fullPage:true,animations:'disabled'});
 await expect(page.getByRole('alert')).toContainText('Great Hall');
 await expect(page.getByRole('heading',{name:"The Lord's Ledger",exact:true})).toBeVisible();expect(errors).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
});

for(const width of [390,1366])test('historical Hall shell values survive Summary and pending event settlement '+width,async({page},info)=>{
 const base={...createInitialState(104),phase:'management',activeTab:'hall',tutorialsSeen:['hall']};
 const snapshot={turn:0,season:'winter',year:25,meters:{people:0,treasury:12.5,church:100,military:50}};
 const state={...base,greatHall:{...base.greatHall,reputation:'An older campaign title',reputationTrack:'balanced',reputationScores:{balanced:2.5},meterHistory:[snapshot,snapshot],compoundFlags:{ironRule:false,olderFlag:true},pendingHallEvent:{type:'crisis',meter:'Old people caption',text:'An older unrest narrative.',chronicle:'An older unrest record.',effects:{people:-2.5}}}};
 const raw=writeV2Save(state),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await expect(page.getByText('An older campaign title',{exact:true})).toBeVisible();await expect(page.getByText('An older unrest narrative.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Summary',exact:true}).click();
 await page.screenshot({path:info.outputPath('historical-summary.png'),fullPage:true,animations:'disabled'});
 await expect(page.getByText('+50',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
 await page.getByRole('button',{name:'Acknowledge',exact:true}).click();
 await page.getByRole('button',{name:'Save game',exact:true}).click();
 const saved=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'));if(!saved)throw Error('Missing saved state');
 const result:unknown=JSON.parse(saved);if(!record(result)||!record(result.state)||!record(result.state.greatHall)||!record(result.state.greatHall.meters))throw Error('Invalid result');
 expect(result.state.greatHall.meters.people).toBe(47.5);expect(result.state.greatHall.pendingHallEvent).toBeNull();expect(result.state.rngState).toBe(base.rngState);
 await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);expect(errors).toEqual([]);
});
