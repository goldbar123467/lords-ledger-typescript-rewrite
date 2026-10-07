import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';
for(const width of [390,1366])for(const disabled of [false,true])test(`Tavern readable stations and Wall ${width} disabled${disabled}`,async({page},info)=>{
 let state:GameSnapshot=gameReducer(createInitialState(104),{type:'START_GAME',payload:{seed:104,difficulty:'normal'}});
 state=gameReducer(state,{type:'SET_TAB',payload:{tab:'map'}});
 state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 state={...state,tavern:{...state.tavern,totalVisits:30,gambitRoundsThisSeason:disabled?5:0,ratsPlayedThisSeason:disabled}};
 const raw=writeV2Save(state),expected=gameReducer(state,{type:'TAVERN_VISIT'}),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:width===1366?768:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
 const card=page.locator('.tavern-card').filter({has:page.getByRole('heading',{name:"Knight's Gambit",exact:true})});
 const wall=page.getByRole('heading',{name:'The Wall',exact:true}).locator('..');
 await expect(card).toHaveJSProperty('disabled',disabled);
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('stations.png'),animations:'disabled'});
 const captions=await card.locator('p').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);let opacity=1;for(let node:Element|null=element;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return{font:parseFloat(style.fontSize),color:style.color,opacity,text:element.textContent};}));
 await wall.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('wall.png'),animations:'disabled'});
 const wallText=await wall.locator('p').evaluateAll(elements=>elements.map(element=>({font:parseFloat(getComputedStyle(element).fontSize),color:getComputedStyle(element).color,text:element.textContent})));
 writeFileSync(info.outputPath('metrics.json'),JSON.stringify({captions,wallText},null,2));
 for(const caption of captions){expect(caption.font).toBeGreaterThanOrEqual(15);expect(caption.opacity).toBe(1);}
 for(const line of wallText)expect(line.font).toBeGreaterThanOrEqual(15);
 await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));expect(writeV2Save(state)).toBe(raw);expect(errors).toEqual([]);
});
