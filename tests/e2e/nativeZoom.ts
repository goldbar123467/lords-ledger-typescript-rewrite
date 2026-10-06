import {chromium,type BrowserContext,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
/** Narrow browser-extension API contract, exercised only inside its owned service worker. */
declare const chrome:{tabs:{
 query:(query:{active:boolean;currentWindow:boolean})=>Promise<readonly {id?:number}[]>;
 setZoom:(tabId:number,factor:number)=>Promise<void>;
 getZoom:(tabId:number)=>Promise<number>;
}};
export async function nativeZoomContext(output:string,baseURL:string):Promise<{context:BrowserContext;setZoom:(factor:number)=>Promise<number>}>{
 const extension=resolve(output,'zoom-extension');mkdirSync(extension,{recursive:true});
 writeFileSync(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:"Lord's Ledger zoom QA",version:'1.0',background:{service_worker:'background.js'}}));
 writeFileSync(join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(() => {});');
 const context=await chromium.launchPersistentContext(resolve(output,'zoom-profile'),{
  channel:'chromium',headless:true,viewport:null,deviceScaleFactor:undefined,isMobile:undefined,baseURL,
  args:['--window-size=1366,844','--disable-extensions-except='+extension,'--load-extension='+extension],
 });
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  return {context,setZoom:async factor=>{
   if(!Number.isFinite(factor)||factor<=0)throw Error('Invalid browser zoom');
   return worker.evaluate(async requested=>{
    if(typeof chrome==='undefined'||typeof chrome.tabs?.setZoom!=='function')throw Error('Native zoom API unavailable');
    const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    if(!tab?.id||!Number.isSafeInteger(tab.id))throw Error('Missing owned browser tab');
    await chrome.tabs.setZoom(tab.id,requested);const actual=await chrome.tabs.getZoom(tab.id);
    if(actual!==requested)throw Error('Browser zoom did not apply');return actual;
   },factor);
  }};
 }catch(error){await context.close();throw error;}
}

/** Capture the browser compositor directly; Playwright's CSS clip is wrong under native zoom. */
export async function captureNativeViewport(page:Page,path:string):Promise<void>{
 await page.locator('.forge-minigame').evaluate(el=>{
  // Match standard screenshot behavior for decorative CSS animation only.
  for(const animation of el.getAnimations({subtree:true}))if(animation.effect?.getComputedTiming().iterations!==Infinity)animation.finish();
 });
 const session=await page.context().newCDPSession(page);
 try{
  const result:unknown=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  if(!result||typeof result!=='object'||!('data'in result)||typeof result.data!=='string')throw Error('Missing native screenshot');
  writeFileSync(path,Buffer.from(result.data,'base64'));
 }finally{await session.detach();}
}
