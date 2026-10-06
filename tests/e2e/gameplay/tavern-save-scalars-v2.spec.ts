import {test,expect} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.js';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';
const decoded=readV2Save(writeV2Save(gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}})));
if(!decoded.ok)throw new Error(decoded.error);const base=decoded.state;
const invalid=[['gambitScribesNoteSeen','yes'],['ratsScribesNoteSeen','yes'],['wallStashFound','yes'],['totalVisits','2'],['gambitTotalWins','2'],['gambitTotalLosses',-1],['gambitNetEarnings','2']] as const;
function snapshot(value:unknown){const result=readV2Save(writeV2Save(value));if(!result.ok)throw new Error(result.error);return result.state;}
for(const format of ['v2','legacy'] as const)for(const [field,value] of invalid)test(`Tavern ${format} malformed ${field} preserves both stored saves`,async({page},info)=>{
 const state={...base,tavern:{...base.tavern,[field]:value}},bad=JSON.stringify(format==='v2'?{format:'lords-ledger',version:2,state}:state);
 const storage={v2:format==='v2'?bad:writeV2Save(base),legacy:format==='legacy'?bad:JSON.stringify(base)},errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:field.includes('Seen')?390:1366,height:844});await page.addInitScript(storage=>{localStorage.setItem('lords-ledger-v2-save',storage.v2);localStorage.setItem('lords-ledger-save',storage.legacy);},storage);
 await page.goto('/');await page.getByRole('button',{name:format==='v2'?'Load saved game':'Import old save',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(field,{timeout:2000});await expect(page.getByRole('button',{name:'Save game',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>({v2:localStorage.getItem('lords-ledger-v2-save'),legacy:localStorage.getItem('lords-ledger-save')}))).toEqual(storage);
 expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('rejected.png')});
});
for(const variant of ['omitted','false','true'] as const)test(`Tavern compatible ${variant} flags retain saves and Scribe behavior`,async({page},info)=>{
 const moved=snapshot(gameReducer(gameReducer(base,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}}));
 const tavern={...moved.tavern};for(const field of ['gambitScribesNoteSeen','ratsScribesNoteSeen','wallStashFound','totalVisits','gambitTotalWins','gambitTotalLosses','gambitNetEarnings'])Reflect.deleteProperty(tavern,field);
 const extra=variant==='omitted'?{}:{gambitScribesNoteSeen:variant==='true',ratsScribesNoteSeen:variant==='true',wallStashFound:variant==='true',totalVisits:2,gambitTotalWins:1,gambitTotalLosses:2,gambitNetEarnings:-125};
 const state={...moved,tavern:{...tavern,...extra}},raw=writeV2Save(state),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:390,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();const visited=snapshot(gameReducer(state,{type:'TAVERN_VISIT'}));
 expect(visited.tavern.totalVisits).toBe(variant==='omitted'?1:3);
 await page.getByRole('button',{name:/Knight's Gambit/}).click();
 if(variant==='true')await expect(page.getByRole('button',{name:'25d',exact:true})).toBeVisible();
 else await expect(page.getByRole('button',{name:'I understand',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(visited));
 await page.screenshot({path:info.outputPath('compatible.png')});expect(errors).toEqual([]);
});
