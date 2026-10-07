import {test,expect,type Page,type Locator} from '@playwright/test';
import {createInitialState,gameReducer} from '../../../src/engine/gameReducer.ts';
import BUILDINGS from '../../../src/data/buildings.ts';
import {nativeZoomContext,captureNativeViewport} from '../nativeZoom.ts';
import {readV2Save,writeV2Save} from '../../../src/save/saveGame.ts';

async function load(page:Page,width:number,root:number){
 if(width>0)await page.setViewportSize({width,height:width===390?600:768});let state=gameReducer(createInitialState(104),{type:'START_GAME',payload:{difficulty:'normal',seed:104}});state=gameReducer(state,{type:'DISMISS_TUTORIAL',payload:{tab:'estate'}});
 // Managed poor-wallet/repair/optional-goods display fixture, not a played acquisition or campaign.
 state={...state,denarii:0,inventory:{...state.inventory,salt:0,tools:2,spices:1},buildings:[...state.buildings,{instanceId:'estate-layout-farm',type:'strip_farm',condition:50,builtOnTurn:0}]};
 const checked=readV2Save(writeV2Save(state));if(!checked.ok)throw new Error(checked.error);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},writeV2Save(checked.state));await page.goto('/');await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',root);await page.getByRole('button',{name:'Load saved game',exact:true}).click();await expect(page.getByRole('heading',{name:'Economy Overview',exact:true})).toBeVisible();return {state:checked.state,errors};
}
async function save(page:Page,loaded:Awaited<ReturnType<typeof load>>){await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(loaded.state));expect(loaded.errors).toEqual([]);}
async function center(element:Locator){await element.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));}
async function contrast(element:Locator){return element.evaluate(node=>{
 const style=getComputedStyle(node),rgb=(value:string)=>{const parts=(value.match(/[\d.]+/g)??[]).map(Number);if(parts.length<3)throw new Error('Missing RGB');return parts.slice(0,3);};
 const luminance=(channels:number[])=>channels.reduce((sum,c,index)=>{const value=c/255,linear=value<=.04045?value/12.92:((value+.055)/1.055)**2.4;return sum+linear*([.2126,.7152,.0722][index]??0);},0);
 let parent:Element|null=node,bg='rgb(35,30,22)',opacity=1,found=false;while(parent){const computed=getComputedStyle(parent);opacity*=Number(computed.opacity);if(!found){const color=computed.backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){bg=color;found=true;}}parent=parent.parentElement;}
 const a=luminance(rgb(style.color)),b=luminance(rgb(bg));return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity};
 });}
async function captionFits(button:Locator){expect(await button.evaluate(element=>{const frame=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);return [...range.getClientRects()].every(rect=>rect.left>=frame.left-1&&rect.right<=frame.right+1&&rect.top>=frame.top-1&&rect.bottom<=frame.bottom+1);})).toBe(true);}
for(const width of [390,1366])for(const root of [16,32]){
 const name=width+' root'+root;
 test(`Estate readable secondary labels ${name}`,async({page},info)=>{
  const loaded=await load(page,width,root);const card=page.getByTestId('built-building-estate-layout-farm'),latin=card.getByText('Ager Communis',{exact:true});await center(latin);await page.screenshot({path:info.outputPath('labels.png'),animations:'disabled'});
  const result=await contrast(latin);expect(result.ratio).toBeGreaterThanOrEqual(4.5);expect(result.opacity).toBe(1);
  const inventory=page.getByRole('heading',{name:'Land & Inventory',exact:true}).locator('..');const zero=inventory.getByText('Timber',{exact:true}).locator('..');expect((await contrast(zero)).opacity).toBe(1);await save(page,loaded);
 });
 test(`Estate whole action captions and targets ${name}`,async({page},info)=>{
  const loaded=await load(page,width,root);const card=page.getByTestId('built-building-estate-layout-farm');await center(card);await page.screenshot({path:info.outputPath('actions.png'),animations:'disabled'});
  for(const button of await card.getByRole('button').all()){const bounds=await button.boundingBox();expect(bounds?.height??0).toBeGreaterThanOrEqual(44);await captionFits(button);}
  const unavailable=page.getByTestId('build-card-mill').getByRole('button',{name:/Need 220d/});await center(unavailable);await expect(unavailable).toBeDisabled();expect((await contrast(unavailable)).ratio).toBeGreaterThanOrEqual(4.5);await captionFits(unavailable);await save(page,loaded);
 });
 test(`Estate native history reading and disclosure ${name}`,async({page},info)=>{
  const loaded=await load(page,width,root);const card=page.getByTestId('built-building-coal_pit-0-pre'),button=card.getByRole('button',{name:'Info',exact:true});
  for(let count=0;count<150&&!(await button.evaluate(element=>element===document.activeElement));count++)await page.keyboard.press('Tab');await expect(button).toBeFocused();
  await expect.poll(()=>button.evaluate(element=>{const rect=element.getBoundingClientRect();return [.05,.5,.95].every(part=>element.contains(document.elementFromPoint(rect.left+rect.width*part,rect.top+rect.height/2)));})).toBe(true);
  await page.screenshot({path:info.outputPath('focus.png'),animations:'disabled'});await expect(button).toHaveAttribute('aria-expanded','false');await page.keyboard.press('Enter');const hide=card.getByRole('button',{name:'Hide',exact:true});await expect(hide).toHaveAttribute('aria-expanded','true');const id=await hide.getAttribute('aria-controls');expect(id).toBeTruthy();const history=card.locator('[id]').filter({hasText:BUILDINGS.coal_pit.historicalNote});await expect(history).toHaveCount(1);await expect(history).toHaveAttribute('id',id??'');await page.keyboard.press('Enter');await expect(card.getByRole('button',{name:'Info',exact:true})).toHaveAttribute('aria-expanded','false');await save(page,loaded);
 });
}
test('Estate ordinary phone overview uses two rows',async({page},info)=>{
 const loaded=await load(page,390,16);const panel=page.getByRole('heading',{name:'Economy Overview',exact:true}).locator('..');await center(panel);await page.screenshot({path:info.outputPath('overview.png'),animations:'disabled'});
 const rows=await panel.evaluate(element=>{const labels=['Food Supply','Income','Upkeep','Net'];return [...new Set(labels.map(label=>{const node=[...element.querySelectorAll('div')].find(div=>div.textContent===label);if(!node?.parentElement)throw new Error('Missing stat');return Math.round(node.parentElement.getBoundingClientRect().top);} ))].length;});expect(rows).toBe(2);await save(page,loaded);
});
test('Estate native browser zoom 200 percent history reading',async({baseURL},info)=>{
 if(typeof baseURL!=='string')throw new Error('Missing isolated server URL');const native=await nativeZoomContext(info.outputPath('native'),baseURL);
 try{
  const page=native.context.pages()[0]??await native.context.newPage();const loaded=await load(page,0,16);await page.bringToFront();const before=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));expect(await native.setZoom(2)).toBe(2);await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBeCloseTo(before.dpr*2,2);expect(await page.evaluate(()=>innerWidth)).toBeCloseTo(before.width/2,0);expect(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom)).toBe('1');
  const card=page.getByTestId('built-building-coal_pit-0-pre'),button=card.getByRole('button',{name:'Info',exact:true});for(let count=0;count<150&&!(await button.evaluate(element=>element===document.activeElement));count++)await page.keyboard.press('Tab');await expect(button).toBeFocused();
  await expect.poll(()=>button.evaluate(element=>{const rect=element.getBoundingClientRect();return element.contains(document.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2));})).toBe(true);expect((await button.boundingBox())?.height??0).toBeGreaterThanOrEqual(44);await captionFits(button);await captureNativeViewport(page,info.outputPath('native-focus.png'));await page.keyboard.press('Enter');await expect(card.getByRole('button',{name:'Hide',exact:true})).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Enter');await save(page,loaded);
 }finally{await native.context.close();}
});

for (const width of [390, 1366]) for (const root of [16, 32]) {
 test('Estate condition glyphs stay within card '+width+' root'+root, async ({page}, info) => {
  const loaded=await load(page,width,root);
  const card=page.getByTestId('built-building-estate-layout-farm');
  const label=card.getByText('Condition:',{exact:true}), value=card.getByText('Fair (50%)',{exact:true});
  await center(value);
  await page.screenshot({path:info.outputPath('condition.png'),animations:'disabled'});
  for (const text of [label,value]) {
   expect(await text.evaluate(element=>{
    const card=element.closest('[data-testid]');if(!card)throw new Error('Missing owning card');
    const frame=card.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);
    return [...range.getClientRects()].every(rect=>rect.left>=frame.left&&rect.right<=frame.right);
   })).toBe(true);
  }
  await expect(value).toHaveText('Fair (50%)');await save(page,loaded);
 });
}