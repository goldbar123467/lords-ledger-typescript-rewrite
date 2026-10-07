import {test,expect,type Page} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save,writeV2Save,type GameSnapshot} from '../../../src/save/saveGame.ts';

interface TimerMark { id:number; delay:number; fired:boolean; cancelled:boolean; stack:string }
interface TimerTrace { enabled:boolean; pending:Map<number,TimerMark>; marks:TimerMark[] }
declare global { interface Window { __llGambitTimers?:TimerTrace } }

async function begin(page:Page){
 let initial=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});
 initial=gameReducer(initial,{type:'SET_TAB',payload:{tab:'map'}});initial=gameReducer(initial,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 initial={...initial,rngState:1,tavern:{...initial.tavern,gambitScribesNoteSeen:true}};
 const loaded=readV2Save(writeV2Save(initial));if(!loaded.ok)throw new Error(loaded.error);const state=loaded.state,errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:1366,height:768});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{
  if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);
  const trace:TimerTrace={enabled:false,pending:new Map(),marks:[]};window.__llGambitTimers=trace;
  const nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);
  const wrappedSet=(handler:TimerHandler,delay?:number,...args:unknown[]):number=>{
   const stack=new Error().stack??'',caller=stack.split('\n')[2]??'';
   if(!trace.enabled||typeof handler!=='function'||delay===undefined||![300,400,600,800].includes(delay)||!(/\/assets\/Tavern-|\/src\/components\/KnightsGambit\.(tsx|jsx)/).test(caller))return nativeSet(handler,delay,...args);
   const mark:TimerMark={id:0,delay,fired:false,cancelled:false,stack};
   const id=nativeSet(()=>{trace.pending.delete(id);mark.fired=true;handler.apply(window,args);},delay);
   mark.id=id;trace.pending.set(id,mark);trace.marks.push(mark);return id;
  };
  const wrappedClear=(id?:number)=>{if(id!==undefined){const mark=trace.pending.get(id);if(mark){mark.cancelled=true;trace.pending.delete(id);}}nativeClear(id);};
  Object.defineProperty(window,'setTimeout',{value:wrappedSet,writable:true,configurable:true});
  Object.defineProperty(window,'clearTimeout',{value:wrappedClear,writable:true,configurable:true});
 },writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
 await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
 const visited=gameReducer(state,{type:'TAVERN_VISIT'});await page.getByRole('button',{name:/Knight's Gambit/}).click();
 await page.getByRole('button',{name:'25d',exact:true}).click();await expect(page.getByRole('button',{name:'Choose Arrow',exact:true})).toBeVisible();
 await page.evaluate(()=>{const trace=window.__llGambitTimers;if(!trace)throw new Error('Missing timer observer');trace.enabled=true;});
 return {state,visited,errors};
}
async function pending(page:Page){return page.evaluate(()=>{const trace=window.__llGambitTimers;if(!trace)throw new Error('Missing timer observer');return [...trace.pending.values()].map(mark=>mark.delay).sort((a,b)=>a-b);});}
async function save(page:Page,state:GameSnapshot){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));}

test('Gambit Load cancels both reveal and pending gold flash',async({page},info)=>{
 const loaded=await begin(page);await page.getByRole('button',{name:'Choose Arrow',exact:true}).click();
 await expect(page.getByText('The stranger reaches for...',{exact:true})).toBeVisible();expect(await pending(page)).toEqual([400,800]);
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:"Knight's Gambit",exact:true})).toHaveCount(0);
 const trace=await page.evaluate(()=>window.__llGambitTimers?.marks);await info.attach('timer-marks',{body:JSON.stringify(trace,null,2),contentType:'application/json'});
 expect(await pending(page)).toEqual([]);
 // Past the longest owned deadline, prove no timer can settle after the reset.
 await page.waitForTimeout(950);await save(page,loaded.state);expect(loaded.errors).toEqual([]);
 await page.screenshot({path:info.outputPath('loaded-estate.png')});
});

test('Gambit Walk Away cancels pending loss cosmetics after paid settlement',async({page},info)=>{
 const loaded=await begin(page);await page.getByRole('button',{name:'Choose Arrow',exact:true}).click();
 await expect(page.getByText('DEFEAT',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__llGambitTimers?.marks.map(mark=>mark.delay))).toEqual([400,800,300,600]);
 const settled=gameReducer(loaded.visited,{type:'TAVERN_GAMBIT_PLAY',payload:{choice:'arrow',wager:25,seed:loaded.visited.rngState}});expect(settled.denarii).toBe(475);
 await page.getByRole('button',{name:'Walk Away',exact:true}).click();await expect(page.getByRole('button',{name:/Knight's Gambit Wager/})).toBeVisible();await expect(page.getByText('DEFEAT',{exact:true})).toHaveCount(0);
 const trace=await page.evaluate(()=>window.__llGambitTimers?.marks);await info.attach('timer-marks',{body:JSON.stringify(trace,null,2),contentType:'application/json'});
 expect(await pending(page)).toEqual([]);
 await page.waitForTimeout(650);await save(page,settled);expect(loaded.errors).toEqual([]);
 await page.screenshot({path:info.outputPath('settled-lobby.png')});
});

