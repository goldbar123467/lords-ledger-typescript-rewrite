import {present} from '../../gameInput.ts';
import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {nativeZoomContext,captureNativeViewport} from '../nativeZoom.ts';
import {forgePanelFixture} from '../../fixtures/forgePanel.ts';
import type {ForgeSavedItem} from '../../../src/engine/forgeState.ts';
import {gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
test('Forge native zoom 200 percent long historical confirmation',async({baseURL},info)=>{
 if(typeof baseURL!=='string')throw Error('Missing isolated server URL');
 const native=await nativeZoomContext(info.outputPath('native'),baseURL);try{
  const page=native.context.pages()[0]??await native.context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const original=forgePanelFixture();
  // Explicit historical-name stress fixture, not a claim of naturally authored acquisition.
  const base={...original,blacksmith:{...original.blacksmith,inventory:present(original.blacksmith.inventory, "original.blacksmith.inventory").map((item:ForgeSavedItem)=>({...item,name:'An older blade inherited from the northern border garrison, with its original maker’s dedication preserved across generations'}))}};
  await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(base));await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Godric',exact:true})).toBeVisible();const expected=gameReducer(base,{type:'BLACKSMITH_VISIT'});
  const before=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));const zoom=await native.setZoom(2);await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBeCloseTo(before.dpr*2,2);
  const after=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom,visualScale:visualViewport?.scale}));expect(after.width).toBeCloseTo(before.width/2,0);expect(after.cssZoom).toBe('1');expect(after.visualScale).toBe(1);writeFileSync(info.outputPath('zoom.json'),JSON.stringify({zoom,before,after},null,2));
  await page.getByRole('navigation',{name:'Forge',exact:true}).getByRole('button',{name:'Armory',exact:true}).click();await page.getByRole('button',{name:/^Select Fine An older blade/}).first().click();await page.getByRole('button',{name:'Sell',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading')).toBeFocused();expect(await dialog.evaluate(el=>el.matches(':modal'))).toBe(true);await captureNativeViewport(page,info.outputPath('heading.png'));
  await page.keyboard.press('Tab');const confirm=dialog.getByRole('button',{name:'Confirm',exact:true});await expect(confirm).toBeFocused();const geometry=await confirm.evaluate(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,viewHeight:innerHeight,hits:[.05,.5,.95].map(part=>el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height*part)))};});expect(geometry.top).toBeGreaterThanOrEqual(16);expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewHeight-16);expect(geometry.height).toBeGreaterThanOrEqual(44);expect(geometry.hits).toEqual([true,true,true]);writeFileSync(info.outputPath('focus.json'),JSON.stringify(geometry,null,2));await captureNativeViewport(page,info.outputPath('focused.png'));
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected));expect(errors).toEqual([]);
 }finally{await native.context.close();}
});
