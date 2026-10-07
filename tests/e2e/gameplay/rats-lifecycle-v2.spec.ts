import {test,expect,type Page} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';

interface RatTimerMark { id:number; delay:number; fired:boolean; cancelled:boolean; stack:string }
interface RatTimerTrace { enabled:boolean; pending:Map<number,RatTimerMark>; marks:RatTimerMark[] }
declare global { interface Window { __llRatTimers?:RatTimerTrace } }

async function begin(page:Page){
 let initial=gameReducer(createInitialState(1),{type:'START_GAME',payload:{difficulty:'easy',seed:1}});
 initial=gameReducer(initial,{type:'SET_TAB',payload:{tab:'map'}});initial=gameReducer(initial,{type:'DISMISS_TUTORIAL',payload:{tab:'map'}});
 const decoded=readV2Save(writeV2Save(initial));if(!decoded.ok)throw new Error(decoded.error);const state=decoded.state,errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:1366,height:768});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(raw=>{
  if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);
  const trace:RatTimerTrace={enabled:false,pending:new Map(),marks:[]};window.__llRatTimers=trace;
  const nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);
  const wrappedSet=(handler:TimerHandler,delay?:number,...args:unknown[]):number=>{
   const stack=new Error().stack??'',caller=stack.split('\n')[2]??'';
   if(!trace.enabled||typeof handler!=='function'||delay===undefined||![400,800].includes(delay)||!(/\/assets\/|\/src\/(components\/RatsInCellar|hooks\/useOwnedTimeout)/).test(caller))return nativeSet(handler,delay,...args);
   const mark:RatTimerMark={id:0,delay,fired:false,cancelled:false,stack};
   const id=nativeSet(()=>{trace.pending.delete(id);mark.fired=true;handler.apply(window,args);},delay);
   mark.id=id;trace.pending.set(id,mark);trace.marks.push(mark);return id;
  };
  const wrappedClear=(id?:number)=>{if(id!==undefined){const mark=trace.pending.get(id);if(mark){mark.cancelled=true;trace.pending.delete(id);}}nativeClear(id);};
  Object.defineProperty(window,'setTimeout',{value:wrappedSet,writable:true,configurable:true});Object.defineProperty(window,'clearTimeout',{value:wrappedClear,writable:true,configurable:true});
 },writeV2Save(state));
 await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
 await page.getByRole('button',{name:/Rats in the Cellar/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Ready!',exact:true}).click();
 await expect(page.getByRole('button',{name:/Rat in cell/})).toBeVisible({timeout:6000});
 await page.evaluate(()=>{const trace=window.__llRatTimers;if(!trace)throw new Error('Missing timer observer');trace.enabled=true;});return {state,errors};
}
async function pending(page:Page){return page.evaluate(()=>{const trace=window.__llRatTimers;if(!trace)throw new Error('Missing timer observer');return [...trace.pending.values()].map(mark=>mark.delay).sort((a,b)=>a-b);});}

for(const action of ['catch','miss'] as const)test(`Load cancels pending rat ${action} feedback`,async({page},info)=>{
 const loaded=await begin(page);
 if(action==='catch'){await page.getByRole('button',{name:/Rat in cell/}).click();await expect(page.getByText('Caught: 1',{exact:true})).toBeVisible();}
 else{await page.getByRole('button',{name:/Empty cell/}).first().click();await expect(page.getByText('Miss!',{exact:true})).toBeVisible();}
 expect(await pending(page)).toEqual([action==='catch'?400:800]);
 await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('button',{name:/Rat in cell/})).toHaveCount(0);
 await info.attach('timer-marks',{body:JSON.stringify(await page.evaluate(()=>window.__llRatTimers?.marks),null,2),contentType:'application/json'});
 expect(await pending(page)).toEqual([]);
 await page.waitForTimeout(950);await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(loaded.state));expect(loaded.errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`${action}-reset-map.png`)});
});
