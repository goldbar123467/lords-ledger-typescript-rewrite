import {test,expect,type Page} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';
const decoded=readV2Save(writeV2Save(gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}})));if(!decoded.ok)throw new Error(decoded.error);const base=decoded.state;
function snapshot(value:unknown){const loaded=readV2Save(writeV2Save(value));if(!loaded.ok)throw new Error(loaded.error);return loaded.state;}
async function enter(page:Page,extra:object,width:number){
 const moved=snapshot(gameReducer(gameReducer(base,{type:'SET_TAB',payload:{tab:'map'}}),{type:'DISMISS_TUTORIAL',payload:{tab:'map'}}));
 const state=snapshot({...moved,...extra}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width,height:844});await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();await expect(page.getByRole('button',{name:/Rats in the Cellar/})).toBeVisible();
 return {state,visited:snapshot(gameReducer(state,{type:'TAVERN_VISIT'})),errors};
}
async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();await expect(page.getByText('Saved!',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}
const warnings=[{name:'treasury',extra:{denarii:1},width:1366},{name:'food stores',extra:{food:1},width:1366},{name:'population',extra:{population:1},width:1366},{name:'garrison',extra:{garrison:0},width:1366},{name:'treasury',extra:{denarii:100,food:100,population:10,garrison:5},width:1366},{name:'garrison',extra:{garrison:0},width:390}];
for(const [index,row] of warnings.entries())test(`Tavern warning ${index} identifies ${row.name} at ${row.width}`,async({page},info)=>{
 const loaded=await enter(page,{...row.extra,tavern:{...base.tavern,pendingStrangerEncounter:'warning'}},row.width);
 await expect(page.getByText(`Your ${row.name} concerns me, my lord. Neglect it at your peril.`,{exact:false})).toBeVisible();await page.screenshot({path:info.outputPath('warning.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Nod silently',exact:true}).click();await expect(page.getByRole('heading',{name:'A Hooded Figure',exact:true})).toHaveCount(0);
 const dismissed=snapshot(gameReducer(loaded.visited,{type:'TAVERN_STRANGER_DISMISS'}));await save(page,dismissed);expect(loaded.errors).toEqual([]);
});
for(const width of [1366,390])test(`Tavern Wall stash pays 25d once and stays empty after reload at ${width}`,async({page},info)=>{
 const loaded=await enter(page,{},width);await page.getByText('✦',{exact:true}).click();await expect(page.getByText('EMPTY',{exact:true})).toBeVisible();
 const found=snapshot(gameReducer(loaded.visited,{type:'TAVERN_WALL_STASH'}));expect(found.denarii).toBe(725);await save(page,found);await page.screenshot({path:info.outputPath('stash.png'),animations:'disabled'});
 const empty=page.getByRole('button',{name:'Empty wall crack',exact:true});await expect(empty).toHaveAttribute('aria-disabled','true');await empty.press('Enter');await save(page,found);await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();await expect(page.getByText('EMPTY',{exact:true})).toBeVisible();await expect(page.getByText('✦',{exact:true})).toHaveCount(0);
 const revisited=snapshot(gameReducer(found,{type:'TAVERN_VISIT'}));await save(page,revisited);expect(loaded.errors).toEqual([]);
});
test('Tavern tip keeps authored warning and dismisses without a payment',async({page},info)=>{
 const loaded=await enter(page,{tavern:{...base.tavern,pendingStrangerEncounter:'tip'}},390);
 await expect(page.getByText('I hear trouble is coming with the next season. Prepare wisely.',{exact:false})).toBeVisible();await page.screenshot({path:info.outputPath('tip.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Nod silently',exact:true}).click();const dismissed=snapshot(gameReducer(loaded.visited,{type:'TAVERN_STRANGER_DISMISS'}));expect(dismissed.denarii).toBe(700);await save(page,dismissed);expect(loaded.errors).toEqual([]);
});
